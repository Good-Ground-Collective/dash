import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createAuthEndpoint } from 'better-auth/api';
import { makeSignature } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';

import { ServicePrincipalForbiddenError } from '#src/auth/errors.ts';
import { KindPrincipalGuard } from '#src/auth/services/principal-guard/principal-guard.ts';

const baseUrl = 'http://localhost:3000';
const secret = 'test-secret-that-is-at-least-32-characters';

const passkeyRegistrationStub = {
  id: 'passkey-registration-stub',
  endpoints: {
    verifyPasskeyRegistration: createAuthEndpoint(
      '/passkey/verify-registration',
      { method: 'POST' },
      async (context) => context.json({ registered: true }),
    ),
  },
} satisfies BetterAuthPlugin;

interface StoredRow {
  id: string;
  kind?: string;
}

class GuardedAuth {
  readonly auth;
  readonly tables = {
    user: new Array<StoredRow>(),
    session: new Array<StoredRow>(),
    account: new Array<StoredRow>(),
    verification: new Array<StoredRow>(),
  };

  constructor() {
    this.auth = betterAuth({
      baseURL: baseUrl,
      secret,
      database: memoryAdapter(this.tables),
      plugins: [new KindPrincipalGuard().plugin, passkeyRegistrationStub],
      advanced: { database: { generateId: 'uuid' } },
      telemetry: { enabled: false },
      logger: { disabled: true },
    });
  }

  async addPerson(): Promise<string> {
    const context = await this.auth.$context;
    const person = await context.internalAdapter.createUser(
      {
        name: 'Ada',
        email: 'ada@example.com',
      },
      { method: 'test' },
    );
    return person.id;
  }

  addServicePrincipal(): string {
    const id = crypto.randomUUID();
    const principal = {
      id,
      name: 'Bench',
      email: `svc-${id}@service.invalid`,
      emailVerified: false,
      image: null,
      kind: 'service',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tables.user.push(principal);
    return id;
  }

  async sessionCookie(props: { userId: string }): Promise<string> {
    const context = await this.auth.$context;
    const session = await context.internalAdapter.createSession(props.userId);
    const signature = await makeSignature(session.token, secret);
    return `${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
  }

  async registerPasskey(props: { cookie: string }): Promise<Response> {
    return this.auth.handler(
      new Request(`${baseUrl}/api/auth/passkey/verify-registration`, {
        method: 'POST',
        headers: {
          cookie: props.cookie,
          origin: baseUrl,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    );
  }
}

describe('KindPrincipalGuard sessions', () => {
  it('gives a person a web session', async () => {
    const guarded = new GuardedAuth();
    const userId = await guarded.addPerson();
    const context = await guarded.auth.$context;

    const session = await context.internalAdapter.createSession(userId);

    expect(session.userId).toBe(userId);
  });

  it('refuses a web session to a service principal', async () => {
    const guarded = new GuardedAuth();
    const userId = guarded.addServicePrincipal();
    const context = await guarded.auth.$context;

    await expect(
      context.internalAdapter.createSession(userId),
    ).rejects.toBeInstanceOf(ServicePrincipalForbiddenError);
    expect(guarded.tables.session).toEqual([]);
  });

  it('refuses a web session for an unknown principal', async () => {
    const guarded = new GuardedAuth();
    const context = await guarded.auth.$context;

    await expect(
      context.internalAdapter.createSession(crypto.randomUUID()),
    ).rejects.toBeInstanceOf(ServicePrincipalForbiddenError);
  });
});

describe('KindPrincipalGuard passkeys and sign-ups', () => {
  it('lets a person register a passkey', async () => {
    const guarded = new GuardedAuth();
    const cookie = await guarded.sessionCookie({
      userId: await guarded.addPerson(),
    });

    const response = await guarded.registerPasskey({ cookie });

    expect(response.status).toBe(200);
  });

  it('refuses passkey registration for a session whose principal is a service', async () => {
    const guarded = new GuardedAuth();
    const userId = await guarded.addPerson();
    const cookie = await guarded.sessionCookie({ userId });
    const principal = guarded.tables.user.find((row) => row.id === userId);
    if (principal !== undefined) {
      principal.kind = 'service';
    }

    const response = await guarded.registerPasskey({ cookie });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'SERVICE_PRINCIPAL_FORBIDDEN',
    });
  });

  it('keeps the service email domain out of Better Auth sign-ups', async () => {
    const guarded = new GuardedAuth();
    const context = await guarded.auth.$context;

    await expect(
      context.internalAdapter.createUser(
        {
          name: 'Impostor',
          email: 'svc-1@Service.Invalid',
        },
        { method: 'test' },
      ),
    ).rejects.toBeInstanceOf(ServicePrincipalForbiddenError);
  });

  it('creates people with kind `user`', async () => {
    const guarded = new GuardedAuth();

    const userId = await guarded.addPerson();

    expect(guarded.tables.user).toEqual([
      expect.objectContaining({ id: userId, kind: 'user' }),
    ]);
  });
});
