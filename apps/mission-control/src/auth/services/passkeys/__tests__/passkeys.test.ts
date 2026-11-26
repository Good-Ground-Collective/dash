import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PasskeyBrowser } from '#src/auth/__tests__/support/passkey-browser.ts';
import {
  PasskeyIdentity,
  passkeyWebOrigin,
  type StoredRow,
} from '#src/auth/__tests__/support/passkey-identity.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';
import {
  type PasskeyEnrolmentSource,
  WebAuthnPasskeys,
} from '#src/auth/services/passkeys/passkeys.ts';
import { KindPrincipalGuard } from '#src/auth/services/principal-guard/principal-guard.ts';

const passkeyListSchema = z.array(
  z.object({ id: z.string(), name: z.string().nullish() }),
);

class PasskeyManagement {
  readonly fixture = new PasskeyIdentity();

  async listed(
    browser: PasskeyBrowser,
  ): Promise<z.infer<typeof passkeyListSchema>> {
    const response = await browser.get('/passkey/list-user-passkeys');
    return passkeyListSchema.parse(await response.json());
  }
}

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

class ServicePrincipalEnrolment {
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

describe('WebAuthnPasskeys sessionless registration', () => {
  it('refuses a passkey-first registration without an enrolment', async () => {
    const { fixture } = new PasskeyManagement();
    await fixture.issueToken();

    const response = await fixture.browser().registerPasskey({
      createSession: true,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'PASSKEY_ENROLMENT_REJECTED',
    });
  });

  it('refuses a passkey-first registration that would not sign in', async () => {
    const { fixture } = new PasskeyManagement();
    const browser = fixture.browser();
    const begun = await browser.beginSetup({
      token: await fixture.issueToken(),
    });
    const { enrolment } = z
      .object({ enrolment: z.string() })
      .parse(await begun.json());

    const response = await browser.registerPasskey({ context: enrolment });

    expect(response.status).toBe(401);
    expect(fixture.tables.user).toEqual([]);
    expect(fixture.tables.passkey).toEqual([]);
  });

  it('refuses a passkey-first registration that resolves to a service principal', async () => {
    const enrolment = new ServicePrincipalEnrolment();

    const response = await enrolment.browser.registerPasskey({
      context: 'any',
      createSession: true,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'SERVICE_PRINCIPAL_FORBIDDEN',
    });
    expect(enrolment.tables.passkey).toEqual([]);
    expect(enrolment.tables.session).toEqual([]);
  });
});

describe('WebAuthnPasskeys management', () => {
  it('lists, adds and renames passkeys after a fresh sign-in', async () => {
    const management = new PasskeyManagement();
    const browser = await management.fixture.firstPerson();

    const added = await browser.registerPasskey({ name: 'Backup key' });
    const [first] = await management.listed(browser);
    const renamed = await browser.post(
      '/passkey/update-passkey',
      JSON.stringify({
        id: first?.id,
        name: 'Work laptop',
      }),
    );

    expect(added.status).toBe(200);
    expect(renamed.status).toBe(200);
    expect((await management.listed(browser)).map((key) => key.name)).toEqual(
      expect.arrayContaining(['Work laptop', 'Backup key']),
    );
  });

  it('removes a passkey while another remains', async () => {
    const management = new PasskeyManagement();
    const browser = await management.fixture.firstPerson();
    await browser.registerPasskey({ name: 'Backup key' });
    const [first] = await management.listed(browser);

    const removed = await browser.post(
      '/passkey/delete-passkey',
      JSON.stringify({
        id: first?.id,
      }),
    );

    expect(removed.status).toBe(200);
    expect(await management.listed(browser)).toHaveLength(1);
  });

  it('refuses to remove the last passkey', async () => {
    const management = new PasskeyManagement();
    const browser = await management.fixture.firstPerson();
    const [only] = await management.listed(browser);

    const removed = await browser.post(
      '/passkey/delete-passkey',
      JSON.stringify({
        id: only?.id,
      }),
    );

    expect(removed.status).toBe(409);
    expect(await removed.json()).toMatchObject({ code: 'LAST_PASSKEY' });
    expect(await management.listed(browser)).toHaveLength(1);
  });
});

describe('WebAuthnPasskeys fresh sign-in', () => {
  it('refuses passkey changes 15 minutes after sign-in', async () => {
    const management = new PasskeyManagement();
    const browser = await management.fixture.firstPerson();
    await browser.registerPasskey({ name: 'Backup key' });
    const [first] = await management.listed(browser);
    management.fixture.ageSessions({ minutes: 15 });

    const responses = [
      await browser.registerPasskey({ name: 'Another' }),
      await browser.post(
        '/passkey/update-passkey',
        JSON.stringify({
          id: first?.id,
          name: 'Renamed',
        }),
      ),
      await browser.post(
        '/passkey/delete-passkey',
        JSON.stringify({ id: first?.id }),
      ),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: 'SESSION_NOT_FRESH',
      });
    }
    expect(await management.listed(browser)).toHaveLength(2);
  });

  it('allows changes again after a new passkey sign-in', async () => {
    const management = new PasskeyManagement();
    const browser = await management.fixture.firstPerson();
    management.fixture.ageSessions({ minutes: 60 });

    await browser.signIn();
    const added = await browser.registerPasskey({ name: 'Backup key' });

    expect(added.status).toBe(200);
  });

  it('still lists passkeys on an older session', async () => {
    const management = new PasskeyManagement();
    const browser = await management.fixture.firstPerson();
    management.fixture.ageSessions({ minutes: 60 });

    expect(await management.listed(browser)).toHaveLength(1);
  });
});
