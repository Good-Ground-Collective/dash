import { memoryAdapter } from 'better-auth/adapters/memory';
import { makeSignature } from 'better-auth/crypto';

import {
  InMemoryServicePrincipalRepository,
  type MemoryUserRow,
} from '#src/auth/__tests__/support/in-memory-service-principals.ts';
import {
  type CreatedServiceAccount,
  createdServiceAccountSchema,
  type NewServiceAccount,
} from '#src/auth/contracts/service-account.ts';
import { AuthModule } from '#src/auth/module.ts';

const secret = 'test-secret-that-is-at-least-32-characters';
export const harnessWebOrigin = 'http://localhost:5173';

/** A memory-adapter row, typed only as far as tests read it. */
export interface HarnessRow {
  id: string;
  createdAt?: Date;
  expiresAt?: Date | null;
  key?: string;
  token?: string;
  userId?: string;
}

/** The auth module over Better Auth's memory adapter, with people to sign in and owner calls to make. */
export class ServiceAccountHarness {
  readonly tables = {
    user: new Array<MemoryUserRow>(),
    session: new Array<HarnessRow>(),
    account: new Array<HarnessRow>(),
    verification: new Array<HarnessRow>(),
    passkey: new Array<HarnessRow>(),
    setupToken: new Array<HarnessRow>(),
    apikey: new Array<HarnessRow>(),
  };
  readonly repository = new InMemoryServicePrincipalRepository({
    users: this.tables.user,
  });
  readonly auth = new AuthModule({
    store: { storage: memoryAdapter(this.tables) },
    servicePrincipalRepository: this.repository,
    apiKeyPrefix: 'dash_dev_',
    secret,
    baseUrl: 'http://localhost:3000',
    webOrigin: harnessWebOrigin,
    trustedOrigins: [harnessWebOrigin],
    secureCookies: false,
  });

  /** Creates a person with a session that started just now, and returns its cookie. */
  async signIn(props: { email?: string } = {}): Promise<string> {
    const context = await this.auth.identity.auth.$context;
    const person = await context.internalAdapter.createUser(
      { name: 'Ada', email: props.email ?? 'ada@example.com' },
      { method: 'test' },
    );
    const session = await context.internalAdapter.createSession(person.id);
    const signature = await makeSignature(session.token, secret);
    return `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  }

  /** Writes a session straight into the table for any principal, skipping the guard that keeps service principals out, and returns its cookie. */
  async forgeSession(props: { userId: string }): Promise<string> {
    const context = await this.auth.identity.auth.$context;
    const token = crypto.randomUUID();
    const now = new Date();
    this.tables.session.push({
      id: crypto.randomUUID(),
      token,
      userId: props.userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });
    const signature = await makeSignature(token, secret);
    return `${context.authCookies.sessionToken.name}=${token}.${signature}`;
  }

  /** Moves every session's start back, as if the sign-in happened `minutes` ago. */
  ageSessions(props: { minutes: number }): void {
    for (const session of this.tables.session) {
      session.createdAt = new Date(Date.now() - props.minutes * 60 * 1000);
    }
  }

  async get(props: { path: string; cookie: string }): Promise<Response> {
    return this.send({ path: props.path, cookie: props.cookie, init: {} });
  }

  async post(props: {
    path: string;
    cookie: string;
    body: object;
  }): Promise<Response> {
    return this.send({
      path: props.path,
      cookie: props.cookie,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(props.body),
      },
    });
  }

  /** Creates a service account through the owner endpoint, failing the test when it is refused. */
  async createAccount(props: {
    cookie: string;
    account: NewServiceAccount;
  }): Promise<CreatedServiceAccount> {
    const response = await this.post({
      path: '/service-accounts/create',
      cookie: props.cookie,
      body: props.account,
    });
    if (!response.ok) {
      throw new Error(`Create failed: ${await response.text()}`);
    }
    return createdServiceAccountSchema.parse(await response.json());
  }

  private async send(props: {
    path: string;
    cookie: string;
    init: RequestInit;
  }): Promise<Response> {
    const headers = new Headers(props.init.headers);
    headers.set('origin', harnessWebOrigin);
    headers.set('cookie', props.cookie);
    return this.auth.identity.handle(
      new Request(`http://localhost:3000/api/auth${props.path}`, {
        ...props.init,
        headers,
      }),
    );
  }
}
