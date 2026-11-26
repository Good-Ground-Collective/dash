import { memoryAdapter } from 'better-auth/adapters/memory';

import { PasskeyBrowser } from '#src/auth/__tests__/support/passkey-browser.ts';
import { BetterAuthIdentity } from '#src/auth/services/identity/identity.ts';

/** The web origin the test browser and passkeys run on. */
export const passkeyWebOrigin = 'http://localhost:5173';

/** A memory-adapter row, typed only as far as tests read it. */
export interface StoredRow {
  id: string;
  kind?: string;
  name?: string | null;
  email?: string;
  emailVerified?: boolean;
  image?: string | null;
  userId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Dash's Better Auth over the memory adapter, with its tables open for assertions. */
export class PasskeyIdentity {
  readonly identity: BetterAuthIdentity;
  readonly tables = {
    user: new Array<StoredRow>(),
    session: new Array<StoredRow>(),
    account: new Array<StoredRow>(),
    verification: new Array<StoredRow>(),
    passkey: new Array<StoredRow>(),
    setupToken: new Array<StoredRow>(),
  };

  constructor() {
    this.identity = new BetterAuthIdentity({
      storage: memoryAdapter(this.tables),
      secret: 'test-secret-that-is-at-least-32-characters',
      baseUrl: 'http://localhost:3000',
      webOrigin: passkeyWebOrigin,
      trustedOrigins: [passkeyWebOrigin],
      secureCookies: false,
    });
  }

  browser(): PasskeyBrowser {
    return new PasskeyBrowser({
      identity: this.identity,
      origin: passkeyWebOrigin,
    });
  }

  /** Issues the boot-time setup token, failing the test when setup is already closed. */
  async issueToken(): Promise<string> {
    const token = await this.identity.issueSetupToken();
    if (token === null) {
      throw new Error('Expected a setup token while nobody has signed up');
    }
    return token;
  }

  /** A browser that has completed setup and holds the first person's session. */
  async firstPerson(): Promise<PasskeyBrowser> {
    const browser = this.browser();
    const response = await browser.setUp({ token: await this.issueToken() });
    if (!response.ok) {
      throw new Error(`Setup failed: ${await response.text()}`);
    }
    return browser;
  }

  addServicePrincipal(): string {
    const id = crypto.randomUUID();
    this.tables.user.push({
      id,
      kind: 'service',
      name: 'Bench',
      email: `svc-${id}@service.invalid`,
      emailVerified: false,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return id;
  }

  /** Moves every session's start back, as if the sign-in happened `minutes` ago. */
  ageSessions(props: { minutes: number }): void {
    for (const session of this.tables.session) {
      session.createdAt = new Date(Date.now() - props.minutes * 60 * 1000);
    }
  }
}
