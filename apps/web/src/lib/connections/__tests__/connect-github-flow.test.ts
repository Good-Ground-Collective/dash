import { describe, expect, it } from 'vitest';
import { HttpGithubAccounts } from '#lib/api/github-accounts.ts';
import { ConnectGithubFlow } from '#lib/connections/connect-github-flow.ts';

const installed = {
  state: 'installed',
  installationId: '7',
  repositorySelection: 'all',
  repositoryCount: 12,
  suspended: false,
  incomplete: false,
  settingsUrl: 'https://github.com/settings/installations/7',
};

/** Sample accounts as Mission Control lists them. */
class Sample {
  static account(login: string, kind: 'user' | 'organization') {
    return {
      externalId: login,
      login,
      kind,
      url: `https://github.com/${login}`,
      avatarUrl: null,
      role: kind === 'user' ? 'personal' : 'member',
    };
  }
}

/** A flow over a Mission Control that answers every call with `answer`. */
class Harness {
  readonly returnTos: string[] = [];
  readonly flow: ConnectGithubFlow;

  constructor(answer: () => Response | Promise<Response>) {
    const accounts = new HttpGithubAccounts({
      baseUrl: 'https://api.example.test',
      fetch: async (input) => {
        this.returnTos.push(
          new URL(String(input)).searchParams.get('returnTo') ?? '',
        );
        return answer();
      },
    });
    this.flow = new ConnectGithubFlow({
      accounts,
      returnTo: '/settings/connections',
    });
  }
}

describe('ConnectGithubFlow', () => {
  it('starts loading', () => {
    expect(ConnectGithubFlow.start()).toEqual({ state: 'loading' });
  });

  it('offers to authorize before GitHub is linked', async () => {
    const harness = new Harness(() =>
      Response.json({
        status: 'authorize',
        authorizeUrl: 'https://github.com/login/oauth/authorize?state=s',
      }),
    );

    const state = await harness.flow.load();

    expect(state).toEqual({
      state: 'authorize',
      authorizeUrl: 'https://github.com/login/oauth/authorize?state=s',
    });
    expect(harness.returnTos).toEqual(['/settings/connections']);
    expect(ConnectGithubFlow.summary(state)).toBe(
      'GitHub isn’t connected yet.',
    );
  });

  it('lists the linked accounts and counts the installed ones', async () => {
    const harness = new Harness(() =>
      Response.json({
        status: 'linked',
        addAccountUrl: 'https://github.com/apps/dash/installations/new',
        accounts: [
          { account: Sample.account('ada', 'user'), install: installed },
          {
            account: Sample.account('acme', 'organization'),
            install: {
              state: 'installable',
              installUrl: 'https://github.com/apps/dash/installations/new',
            },
          },
        ],
      }),
    );

    const state = await harness.flow.load();

    expect(state.state).toBe('linked');
    expect(state.state === 'linked' && state.accounts).toHaveLength(2);
    expect(ConnectGithubFlow.summary(state)).toBe(
      '2 GitHub accounts, 1 installed.',
    );
  });
});

describe('ConnectGithubFlow failures', () => {
  it('reports a signed-out person separately from a failure', async () => {
    const signedOut = new Harness(() =>
      Response.json({ code: 'SIGN_IN_REQUIRED' }, { status: 401 }),
    );
    const down = new Harness(() => new Response('down', { status: 503 }));
    const unreachable = new Harness(async () =>
      Promise.reject(new TypeError('fetch failed')),
    );

    expect(await signedOut.flow.load()).toEqual({ state: 'signed-out' });
    for (const harness of [down, unreachable]) {
      const state = await harness.flow.load();
      expect(state.state).toBe('failed');
      expect(ConnectGithubFlow.summary(state)).toBe('');
    }
  });
});
