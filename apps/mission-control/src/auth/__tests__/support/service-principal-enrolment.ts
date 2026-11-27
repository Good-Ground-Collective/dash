import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';

import { PasskeyBrowser } from '#src/auth/__tests__/support/passkey-browser.ts';
import {
  passkeyWebOrigin,
  type StoredRow,
} from '#src/auth/__tests__/support/passkey-identity.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';
import {
  type PasskeyEnrolmentSource,
  WebAuthnPasskeys,
} from '#src/auth/services/passkeys/passkeys.ts';
import { KindPrincipalGuard } from '#src/auth/services/principal-guard/principal-guard.ts';

/** Hands every passkey-first registration to one fixed principal, as a buggy recovery source might. */
class FixedPrincipalSource implements PasskeyEnrolmentSource {
  private readonly principalId: string;

  constructor(props: { principalId: string }) {
    this.principalId = props.principalId;
  }

  async resolve(): Promise<{ id: string; name: string }> {
    return { id: this.principalId, name: 'bench' };
  }

  async complete(): Promise<string> {
    return this.principalId;
  }
}

/** A Better Auth instance whose only enrolment source resolves to a service principal. */
export class ServicePrincipalEnrolment {
  readonly tables = {
    user: new Array<StoredRow>(),
    session: new Array<StoredRow>(),
    account: new Array<StoredRow>(),
    verification: new Array<StoredRow>(),
    passkey: new Array<StoredRow>(),
  };

  readonly browser: PasskeyBrowser;

  constructor() {
    const principalId = crypto.randomUUID();
    this.tables.user.push({
      id: principalId,
      name: 'Bench',
      email: `svc-${principalId}@service.invalid`,
      emailVerified: false,
      kind: 'service',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const guard = new KindPrincipalGuard();
    const passkeys = new WebAuthnPasskeys({
      guard,
      sources: [new FixedPrincipalSource({ principalId })],
      webOrigin: passkeyWebOrigin,
      freshAgeSeconds: 900,
    });
    const auth = betterAuth({
      baseURL: 'http://localhost:3000',
      secret: 'test-secret-that-is-at-least-32-characters',
      database: memoryAdapter(this.tables),
      trustedOrigins: [passkeyWebOrigin],
      plugins: [guard.plugin, ...passkeys.plugins],
      advanced: { database: { generateId: 'uuid' } },
      telemetry: { enabled: false },
      logger: { disabled: true },
    });
    const identity: Pick<Identity, 'baseUrl' | 'basePath' | 'handle'> = {
      baseUrl: 'http://localhost:3000',
      basePath: '/api/auth',
      handle: async (request) => auth.handler(request),
    };
    this.browser = new PasskeyBrowser({
      identity,
      origin: passkeyWebOrigin,
    });
  }
}
