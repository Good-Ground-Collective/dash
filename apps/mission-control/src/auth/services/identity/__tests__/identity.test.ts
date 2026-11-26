import { memoryAdapter } from 'better-auth/adapters/memory';
import { makeSignature } from 'better-auth/crypto';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { ZodError } from 'zod';

import {
  BetterAuthIdentity,
  type IdentitySettings,
} from '#src/auth/services/identity/identity.ts';

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

describe('BetterAuthIdentity cookies and lifetime', () => {
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

  it('issues 30-day sessions that slide forward, with a renewed cookie, once a day old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const fixture = new IdentityFixture({ settings: localSettings });
    const { cookie, expiresAt } = await fixture.signIn();

    expect(expiresAt.toISOString()).toBe('2026-01-31T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    const untouched = await fixture.identity.session({
      headers: new Headers({ cookie }),
    });
    const refreshed = await fixture.identity.handle(
      new Request('http://localhost:3000/api/auth/get-session', {
        headers: { cookie },
      }),
    );
    const slid = await fixture.identity.session({
      headers: new Headers({ cookie }),
    });

    expect(untouched?.expiresAt.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(refreshed.headers.getSetCookie()).toContainEqual(
      expect.stringContaining('better-auth.session_token='),
    );
    expect(slid?.expiresAt.toISOString()).toBe('2026-02-02T00:00:00.000Z');
  });
});

describe('BetterAuthIdentity sessions', () => {
  it('reads the session as a principal with its kind', async () => {
    const fixture = new IdentityFixture({ settings: localSettings });
    const { cookie } = await fixture.signIn();

    const session = await fixture.identity.session({
      headers: new Headers({ cookie }),
    });

    expect(session).toMatchObject({ kind: 'user' });
    expectTypeOf<NonNullable<typeof session>['kind']>().toEqualTypeOf<
      'user' | 'service'
    >();
  });

  it('reads no session without a cookie', async () => {
    const fixture = new IdentityFixture({ settings: localSettings });

    expect(await fixture.identity.session({ headers: new Headers() })).toBe(
      null,
    );
  });

  it('rejects a secret shorter than 32 characters', () => {
    expect(
      () =>
        new IdentityFixture({ settings: { ...localSettings, secret: 'x' } }),
    ).toThrow(ZodError);
  });
});
