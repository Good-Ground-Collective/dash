import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpGithubAccounts } from '#lib/api/github-accounts.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

const baseUrl = 'https://api.example.test';

class RecordingFetch {
  readonly calls: { url: string; init: RequestInit | undefined }[] = [];
  private readonly response: () => Response;

  constructor(props: { response: () => Response }) {
    this.response = props.response;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), init });
    return this.response();
  };
}

const linked = {
  status: 'linked',
  addAccountUrl: 'https://github.com/apps/dash/installations/new?state=s',
  accounts: [
    {
      account: {
        provider: 'github',
        externalId: '42',
        url: 'https://github.com/acme',
        login: 'acme',
        kind: 'organization',
        avatarUrl: null,
        role: 'owner',
      },
      install: {
        state: 'installed',
        installationId: '7',
        repositorySelection: 'selected',
        repositoryCount: 3,
        suspended: false,
        incomplete: false,
        settingsUrl:
          'https://github.com/organizations/acme/settings/installations/7',
        connectionId: null,
      },
    },
  ],
};

describe('HttpGithubAccounts', () => {
  it('asks for the accounts with credentials and the return path', async () => {
    const recorder = new RecordingFetch({
      response: () => Response.json(linked),
    });
    const accounts = new HttpGithubAccounts({
      baseUrl,
      fetch: recorder.fetch,
    });

    const answer = await accounts.list({ returnTo: '/setup/github' });

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.url).toBe(
      'https://api.example.test/integrations/github/accounts?returnTo=%2Fsetup%2Fgithub',
    );
    expect(recorder.calls[0]?.init?.credentials).toBe('include');
    expect(answer.status).toBe('linked');
    expect(
      answer.status === 'linked' && answer.accounts[0]?.account.login,
    ).toBe('acme');
  });

  it('refuses a return path that leaves the web app before calling', async () => {
    const recorder = new RecordingFetch({
      response: () => Response.json(linked),
    });
    const accounts = new HttpGithubAccounts({
      baseUrl,
      fetch: recorder.fetch,
    });

    for (const returnTo of [
      'https://evil.example/',
      '//evil.example',
      '/setup/github?token=x',
    ]) {
      await expect(accounts.list({ returnTo })).rejects.toThrow(
        /path in the web app/u,
      );
    }
    expect(recorder.calls).toEqual([]);
  });
});

describe('HttpGithubAccounts refusals', () => {
  it('rejects a link that isn’t http or https as a schema error on that link', async () => {
    const answering = (authorizeUrl: string): HttpGithubAccounts =>
      new HttpGithubAccounts({
        baseUrl,
        fetch: new RecordingFetch({
          response: () => Response.json({ status: 'authorize', authorizeUrl }),
        }).fetch,
      });

    const failure = await answering('javascript:alert(1)')
      .list({ returnTo: '/setup/github' })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(z.ZodError);
    expect(failure instanceof z.ZodError && failure.issues[0]?.path).toEqual([
      'authorizeUrl',
    ]);
    await expect(
      answering('https://github.com/login/oauth/authorize').list({
        returnTo: '/setup/github',
      }),
    ).resolves.toEqual({
      status: 'authorize',
      authorizeUrl: 'https://github.com/login/oauth/authorize',
    });
  });

  it('carries Mission Control’s refusal', async () => {
    const accounts = new HttpGithubAccounts({
      baseUrl,
      fetch: new RecordingFetch({
        response: () =>
          Response.json(
            { code: 'SIGN_IN_REQUIRED', message: 'Sign in' },
            { status: 401 },
          ),
      }).fetch,
    });

    const failure = await accounts
      .list({ returnTo: '/setup/github' })
      .catch((cause: unknown) => cause);

    expect(failure).toBeInstanceOf(MissionControlError);
    expect(failure).toMatchObject({ status: 401, code: 'SIGN_IN_REQUIRED' });
  });
});

describe('HttpGithubAccounts lookUp', () => {
  it('looks an organisation up by its trimmed login with the return path', async () => {
    const recorder = new RecordingFetch({
      response: () => Response.json({ status: 'missing' }),
    });
    const accounts = new HttpGithubAccounts({
      baseUrl,
      fetch: recorder.fetch,
    });

    const answer = await accounts.lookUp({
      login: ' acme ',
      returnTo: '/setup/github',
    });

    expect(answer).toEqual({ status: 'missing' });
    expect(recorder.calls[0]?.url).toBe(
      'https://api.example.test/integrations/github/accounts/lookup?login=acme&returnTo=%2Fsetup%2Fgithub',
    );
    expect(recorder.calls[0]?.init?.credentials).toBe('include');
  });

  it('refuses a login no GitHub account could have before calling', async () => {
    const recorder = new RecordingFetch({
      response: () => Response.json({ status: 'missing' }),
    });
    const accounts = new HttpGithubAccounts({
      baseUrl,
      fetch: recorder.fetch,
    });

    await expect(
      accounts.lookUp({ login: 'acme/app', returnTo: '/setup/github' }),
    ).rejects.toThrow(/only letters, digits and single dashes/u);
    expect(recorder.calls).toEqual([]);
  });
});
