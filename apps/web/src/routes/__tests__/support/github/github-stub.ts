import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { GithubFeedStub } from './github-feed-stub.ts';
import { GithubWatchedChecksStub } from './github-watched-checks-stub.ts';
import {
  type StubAccount,
  GithubStubAccounts,
} from './github-stub-accounts.ts';

const scenarioSchema = z.enum(['authorize', 'linked', 'failing']);
const returnToSchema = z.string().regex(/^\/(?:[\w-]+(?:\/[\w-]+)*)?$/u);

type Scenario = z.infer<typeof scenarioSchema>;

interface StubJson {
  status: number;
  body: object;
}

/** Organisations a lookup finds that the list doesn't show. `initech` is also a public membership, so it's suggested. */
const findable = ['globex', 'initech'];
const publicMemberships = ['initech'];

/**
 * Mission Control's `GET /integrations/github/accounts` and stand-ins for GitHub's side of the
 * connect round trip. Authorizing, installing and the account picker each redirect straight back
 * to the web app with the `connect=` result Mission Control's callbacks send. Avatars are small
 * SVGs served here, so the page never calls GitHub. `POST /__stub/scenario?name=…` picks
 * whether the person has authorized yet, or whether listing fails. `/accounts/lookup` finds the
 * `findable` organisations, and their install link, numbered afresh by each lookup, records a request. `/feed` is `GithubFeedStub`, and `/watched-checks` is `GithubWatchedChecksStub`.
 */
export class GithubStub {
  private readonly webOrigin: () => string;
  private scenario: Scenario = 'authorize';
  private accounts: StubAccount[] = GithubStubAccounts.sample();
  /** Numbers each lookup's install link, standing in for the fresh signed state Mission Control gives it. */
  private lookups = 0;
  private readonly watched = new GithubWatchedChecksStub();
  private readonly feed = new GithubFeedStub({ watched: this.watched });

  constructor(props: {
    /** The web app the round trips send the person back to. */
    webOrigin: () => string;
  }) {
    this.webOrigin = props.webOrigin;
  }

  reset(): void {
    this.scenario = 'authorize';
    this.accounts = GithubStubAccounts.sample();
    this.lookups = 0;
    this.feed.reset();
    this.watched.reset();
  }

  /** Whether Dash would hold a GitHub connection: authorized, with an installation that isn't suspended. */
  connected(): boolean {
    return (
      this.scenario === 'linked' &&
      this.accounts.some(
        (account) =>
          account.install.state === 'installed' &&
          account.install.suspended !== true,
      )
    );
  }

  /** Answers a `/integrations/github/…` request. */
  serve(props: {
    request: IncomingMessage;
    response: ServerResponse;
    url: URL;
    body: string;
    signedIn: boolean;
  }): void {
    const { response, url } = props;
    const returnTo = url.searchParams.get('returnTo') ?? '/setup/github';
    const back = (query: string): void => {
      response.writeHead(302, {
        location: `${this.webOrigin()}${returnTo}?${query}&provider=github`,
      });
      response.end();
    };
    const page = url.pathname.replace(/^\/integrations\/github/u, '');
    const reply = this.jsonReply({ ...props, page, returnTo });

    if (reply !== null) {
      GithubStub.send(response, reply);
    } else if (page.startsWith('/__stub/avatars/')) {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end(
        GithubStubAccounts.avatar(page.slice('/__stub/avatars/'.length)),
      );
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
    } else if (page === '/__stub/request') {
      this.request(url.searchParams.get('login') ?? '');
      back('connect=requested');
    } else if (page === '/__stub/feed') {
      this.feed.choose(url.searchParams.get('name'));
      response.writeHead(204).end();
    } else {
      response.writeHead(404).end();
    }
  }

  /** The JSON answers of the feed, the watched checks and the account lists, or `null` for any other page. */
  private jsonReply(props: {
    request: IncomingMessage;
    url: URL;
    body: string;
    signedIn: boolean;
    page: string;
    returnTo: string;
  }): StubJson | null {
    const { page, url, signedIn, returnTo } = props;
    const origin = `http://${props.request.headers.host ?? 'localhost'}`;

    if (page === '/feed') {
      return this.feed.feed({ signedIn });
    }
    if (page.startsWith('/watched-checks')) {
      return this.watched.serve({
        method: props.request.method ?? 'GET',
        page,
        query: url.searchParams,
        body: props.body,
        signedIn,
      });
    }
    if (page === '/accounts') {
      return this.list({ origin, signedIn, returnTo });
    }
    if (page === '/accounts/lookup') {
      return this.lookUp({
        origin,
        signedIn,
        returnTo,
        login: url.searchParams.get('login') ?? '',
      });
    }
    return null;
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
          GithubStubAccounts.toWire({ account, index, stub, query }),
        ),
        suggestions: publicMemberships
          .filter((login) => !this.accounts.some((a) => a.login === login))
          .map((login) => ({
            login,
            avatarUrl: `${stub}/avatars/${login}.svg`,
          })),
      },
    };
  }

  private lookUp(props: {
    origin: string;
    signedIn: boolean;
    returnTo: string;
    login: string;
  }): StubJson {
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    const stub = `${props.origin}/integrations/github/__stub`;
    const query = `returnTo=${encodeURIComponent(props.returnTo)}`;
    const index = this.accounts.findIndex(({ login }) => login === props.login);
    const listed = this.accounts[index];
    if (listed !== undefined) {
      const entry = GithubStubAccounts.toWire({
        account: listed,
        index,
        stub,
        query,
      });
      return { status: 200, body: { status: 'found', entry } };
    }
    if (!findable.includes(props.login)) {
      return { status: 200, body: { status: 'missing' } };
    }
    const entry = GithubStubAccounts.toWire({
      account: GithubStubAccounts.organisation(props.login),
      index: this.accounts.length,
      stub,
      query,
    });
    return {
      status: 200,
      body: {
        status: 'found',
        entry: {
          ...entry,
          install: {
            state: 'requestable',
            installUrl: `${stub}/request?login=${props.login}&link=${String(++this.lookups)}&${query}`,
          },
        },
      },
    };
  }

  private request(login: string): void {
    if (!findable.includes(login)) return;
    this.accounts = [
      ...this.accounts.filter((account) => account.login !== login),
      {
        ...GithubStubAccounts.organisation(login),
        install: { state: 'requested' },
      },
    ];
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

  private static send(response: ServerResponse, reply: StubJson): void {
    response.writeHead(reply.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(reply.body));
  }
}
