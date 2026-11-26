import { memoryAdapter } from 'better-auth/adapters/memory';
import { makeSignature } from 'better-auth/crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import {
  BetterAuthIdentity,
  type IdentitySettings,
} from '#src/auth/services/identity/identity.ts';
import { KindPrincipalGuard } from '#src/auth/services/principal-guard/principal-guard.ts';

const secret = 'test-secret-that-is-at-least-32-characters';
const daySeconds = 60 * 60 * 24;

const localSettings: IdentitySettings = {
  secret,
  baseUrl: 'http://localhost:3000',
  trustedOrigins: ['http://localhost:5173'],
  secureCookies: false,
};

const productionSettings: IdentitySettings = {
  secret,
  baseUrl: 'https://api.dash.doublel.studio',
  trustedOrigins: ['https://dash.doublel.studio'],
  cookieDomain: 'dash.doublel.studio',
  secureCookies: true,
};

class IdentityFixture {
  readonly identity: BetterAuthIdentity;

  constructor(props: { settings: IdentitySettings }) {
    this.identity = new BetterAuthIdentity({
      ...props.settings,
      storage: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
      }),
      guard: new KindPrincipalGuard(),
    });
  }

  async signIn(): Promise<{ cookie: string; expiresAt: Date }> {
    const context = await this.identity.auth.$context;
    const person = await context.internalAdapter.createUser(
      {
        name: 'Ada',
        email: 'ada@example.com',
      },
      { method: 'test' },
    );
    const session = await context.internalAdapter.createSession(person.id);
    const signature = await makeSignature(session.token, secret);
    return {
      cookie: `${context.authCookies.sessionToken.name}=${session.token}.${signature}`,
      expiresAt: session.expiresAt,
    };
  }
}

describe('BetterAuthIdentity', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the production session cookie on dash.doublel.studio, Secure, HttpOnly and SameSite=Lax', async () => {
    const { identity } = new IdentityFixture({ settings: productionSettings });

    const { sessionToken } = (await identity.auth.$context).authCookies;

    expect(sessionToken.name).toBe('__Secure-better-auth.session_token');
    expect(sessionToken.attributes).toMatchObject({
      domain: 'dash.doublel.studio',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * daySeconds,
    });
  });

  it('keeps the local session cookie host-only and usable over http', async () => {
    const { identity } = new IdentityFixture({ settings: localSettings });

    const { sessionToken } = (await identity.auth.$context).authCookies;

    expect(sessionToken.name).toBe('better-auth.session_token');
    expect(sessionToken.attributes).toMatchObject({
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
    });
    expect(sessionToken.attributes.domain).toBeUndefined();
  });

  it('issues 30-day sessions and slides them forward once a day old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const fixture = new IdentityFixture({ settings: localSettings });
    const { cookie, expiresAt } = await fixture.signIn();

    expect(expiresAt.toISOString()).toBe('2026-01-31T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    const session = await fixture.identity.auth.api.getSession({
      headers: new Headers({ cookie }),
    });

    expect(session?.session.expiresAt.toISOString()).toBe(
      '2026-02-02T00:00:00.000Z',
    );
  });

  it('rejects a secret shorter than 32 characters', () => {
    expect(
      () =>
        new IdentityFixture({ settings: { ...localSettings, secret: 'x' } }),
    ).toThrow(ZodError);
  });
});
