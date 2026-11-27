import { describe, expect, it } from 'vitest';
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
  it('rejects a link that isn’t http or https', async () => {
    const accounts = new HttpGithubAccounts({
      baseUrl,
      fetch: new RecordingFetch({
        response: () =>
          Response.json({
            status: 'authorize',
            authorizeUrl: 'javascript:alert(1)',
          }),
      }).fetch,
    });

    await expect(
      accounts.list({ returnTo: '/setup/github' }),
    ).rejects.toThrow();
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
