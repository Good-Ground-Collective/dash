import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';

const scenarioSchema = z.enum(['authorize', 'linked', 'failing']);
const returnToSchema = z.string().regex(/^\/(?:[\w-]+(?:\/[\w-]+)*)?$/u);

type Scenario = z.infer<typeof scenarioSchema>;

interface StubJson {
  status: number;
  body: object;
}

interface StubAccount {
  login: string;
  kind: 'user' | 'organization';
  role: 'personal' | 'owner' | 'member' | null;
  avatar: boolean;
  install:
    | { state: 'installable' }
    | {
        state: 'installed';
        repositorySelection: 'all' | 'selected';
        repositoryCount: number | null;
        suspended?: boolean;
        incomplete?: boolean;
      };
}

const avatarHues = ['#c2410c', '#0f766e', '#4338ca', '#be123c', '#a16207'];

/**
 * Mission Control's `GET /integrations/github/accounts` and stand-ins for GitHub's side of the
 * connect round trip. Authorizing, installing and the account picker each redirect straight back
 * to the web app with the `connect=` result Mission Control's callbacks send. Avatars are small
 * SVGs served here, so the page never calls GitHub. `POST /__stub/scenario?name=…` picks
 * whether the person has authorized yet, or whether listing fails.
 */
export class GithubStub {
  private readonly webOrigin: () => string;
  private scenario: Scenario = 'authorize';
  private accounts: StubAccount[] = GithubStub.sampleAccounts();

  constructor(props: {
    /** The web app the round trips send the person back to. */
    webOrigin: () => string;
  }) {
    this.webOrigin = props.webOrigin;
  }

  reset(): void {
    this.scenario = 'authorize';
    this.accounts = GithubStub.sampleAccounts();
  }

  /** Whether Dash would hold a GitHub connection: authorized, with the app installed somewhere. */
  connected(): boolean {
    return (
      this.scenario === 'linked' &&
      this.accounts.some((account) => account.install.state === 'installed')
    );
  }

  /** Answers a `/integrations/github/…` request. */
  serve(props: {
    request: IncomingMessage;
    response: ServerResponse;
    url: URL;
    signedIn: boolean;
  }): void {
    const { response, url } = props;
    const origin = `http://${props.request.headers.host ?? 'localhost'}`;
    const returnTo = url.searchParams.get('returnTo') ?? '/setup/github';
    const back = (query: string): void => {
      response.writeHead(302, {
        location: `${this.webOrigin()}${returnTo}?${query}&provider=github`,
      });
      response.end();
    };
    const page = url.pathname.replace(/^\/integrations\/github/u, '');

    if (page.startsWith('/__stub/avatars/')) {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end(GithubStub.avatar(page.slice('/__stub/avatars/'.length)));
    } else if (page === '/__stub/scenario') {
      this.scenario = scenarioSchema.parse(url.searchParams.get('name'));
      response.writeHead(204).end();
    } else if (page === '/__stub/authorize') {
      this.scenario = 'linked';
      back('connect=linked');
    } else if (page === '/__stub/install') {
      this.install(url.searchParams.get('login') ?? '');
      back('connect=installed');
    } else if (page === '/__stub/pick') {
      back('connect=requested');
    } else if (page === '/accounts') {
      const reply = this.list({ origin, signedIn: props.signedIn, returnTo });
      response.writeHead(reply.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    } else {
      response.writeHead(404).end();
    }
  }

  private list(props: {
    origin: string;
    signedIn: boolean;
    returnTo: string;
  }): StubJson {
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    if (!returnToSchema.safeParse(props.returnTo).success) {
      return { status: 400, body: { code: 'FST_ERR_VALIDATION' } };
    }
    if (this.scenario === 'failing') {
      return { status: 502, body: { code: 'PROVIDER_UNAVAILABLE' } };
    }

    const stub = `${props.origin}/integrations/github/__stub`;
    const query = `returnTo=${encodeURIComponent(props.returnTo)}`;
    if (this.scenario === 'authorize') {
      return {
        status: 200,
        body: {
          status: 'authorize',
          authorizeUrl: `${stub}/authorize?${query}`,
        },
      };
    }

    return {
      status: 200,
      body: {
        status: 'linked',
        addAccountUrl: `${stub}/pick?${query}`,
        accounts: this.accounts.map((account, index) =>
          GithubStub.toWire({ account, index, stub, query }),
        ),
      },
    };
  }

  private install(login: string): void {
    this.accounts = this.accounts.map((account) =>
      account.login === login
        ? {
            ...account,
            install: {
              state: 'installed',
              repositorySelection: 'all',
              repositoryCount: 12,
            },
          }
        : account,
    );
  }

  private static toWire(props: {
    account: StubAccount;
    index: number;
    stub: string;
    query: string;
  }) {
    const { account, stub } = props;
    const id = String(1000 + props.index);
    const install =
      account.install.state === 'installable'
        ? {
            state: 'installable',
            installUrl: `${stub}/install?login=${account.login}&${props.query}`,
          }
        : {
            state: 'installed',
            installationId: id,
            repositorySelection: account.install.repositorySelection,
            repositoryCount: account.install.repositoryCount,
            suspended: account.install.suspended ?? false,
            incomplete: account.install.incomplete ?? false,
            settingsUrl: `https://github.com/settings/installations/${id}`,
            connectionId: null,
          };
    return {
      account: {
        provider: 'github',
        externalId: id,
        url: `https://github.com/${account.login}`,
        login: account.login,
        kind: account.kind,
        avatarUrl: account.avatar
          ? `${stub}/avatars/${account.login}.svg`
          : null,
        role: account.role,
      },
      install,
    };
  }

  private static avatar(file: string): string {
    const login = file.replace(/\.svg$/u, '');
    const hue = avatarHues[login.length % avatarHues.length] ?? '#444444';
    const letter = (login.at(0) ?? '?').toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${hue}"/><text x="16" y="21" font-family="sans-serif" font-size="14" fill="#ffffff" text-anchor="middle">${letter}</text></svg>`;
  }

  private static sampleAccounts(): StubAccount[] {
    return [
      {
        login: 'ada',
        kind: 'user',
        role: 'personal',
        avatar: true,
        install: { state: 'installable' },
      },
      {
        login: 'acme-labs',
        kind: 'organization',
        role: 'owner',
        avatar: true,
        install: {
          state: 'installed',
          repositorySelection: 'selected',
          repositoryCount: 3,
        },
      },
      {
        login: 'night-shift',
        kind: 'organization',
        role: 'member',
        avatar: true,
        install: {
          state: 'installed',
          repositorySelection: 'all',
          repositoryCount: null,
        },
      },
      {
        login: 'old-co',
        kind: 'organization',
        role: 'owner',
        avatar: true,
        install: {
          state: 'installed',
          repositorySelection: 'selected',
          repositoryCount: null,
          suspended: true,
        },
      },
      {
        login: 'rate-limited',
        kind: 'organization',
        role: null,
        avatar: false,
        install: {
          state: 'installed',
          repositorySelection: 'selected',
          repositoryCount: null,
          incomplete: true,
        },
      },
    ];
  }
}
