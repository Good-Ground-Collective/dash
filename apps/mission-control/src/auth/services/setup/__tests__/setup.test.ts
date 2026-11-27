import { describe, expect, it } from 'vitest';

import {
  PasskeyIdentity,
  passkeyWebOrigin,
} from '#src/auth/__tests__/support/passkey-identity.ts';
import { setupEnrolmentSchema } from '#src/auth/contracts/setup.ts';

describe('TokenSetup tokens', () => {
  it('issues a token at boot while nobody has signed up, storing only its hash', async () => {
    const fixture = new PasskeyIdentity();

    const token = await fixture.issueToken();
    const status = await fixture.browser().get('/setup/status');

    expect(token).toMatch(/^[A-Za-z0-9]{40}$/u);
    expect(await status.json()).toEqual({ open: true });
    expect(fixture.tables.setupToken).toHaveLength(1);
    expect(JSON.stringify(fixture.tables.setupToken)).not.toContain(token);
  });

  it('replaces the previous token at each boot', async () => {
    const fixture = new PasskeyIdentity();
    const first = await fixture.issueToken();
    await fixture.issueToken();

    const response = await fixture.browser().beginSetup({ token: first });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'SETUP_TOKEN_REJECTED',
    });
    expect(fixture.tables.setupToken).toHaveLength(1);
  });

  it('issues nothing and clears leftovers once someone has signed up', async () => {
    const fixture = new PasskeyIdentity();
    await fixture.issueToken();
    const context = await fixture.identity.auth.$context;
    await context.internalAdapter.createUser(
      { name: 'Grace', email: 'grace@example.com' },
      { method: 'test' },
    );

    expect(await fixture.identity.issueSetupToken()).toBeNull();
    expect(fixture.tables.setupToken).toEqual([]);
    expect(await (await fixture.browser().get('/setup/status')).json()).toEqual(
      { open: false },
    );
  });

  it('refuses a wrong token', async () => {
    const fixture = new PasskeyIdentity();
    await fixture.issueToken();

    const response = await fixture.browser().beginSetup({ token: 'guess' });

    expect(response.status).toBe(401);
  });
});

describe('TokenSetup token check', () => {
  it('accepts the current token without spending it', async () => {
    const fixture = new PasskeyIdentity();
    const token = await fixture.issueToken();
    const browser = fixture.browser();

    const checked = await browser.checkSetup({ token });
    const setUp = await browser.setUp({ token });

    expect(checked.status).toBe(200);
    expect(await checked.json()).toEqual({ valid: true });
    expect(setUp.status).toBe(200);
    expect(fixture.tables.user).toHaveLength(1);
  });

  it('rejects a wrong token the way begin does', async () => {
    const fixture = new PasskeyIdentity();
    await fixture.issueToken();

    const response = await fixture.browser().checkSetup({ token: 'guess' });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: 'SETUP_TOKEN_REJECTED',
    });
    expect(fixture.tables.setupToken).toHaveLength(1);
  });

  it('refuses once someone has signed up', async () => {
    const fixture = new PasskeyIdentity();
    const token = await fixture.issueToken();
    await fixture.browser().setUp({ token });

    const response = await fixture.browser().checkSetup({ token });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SETUP_CLOSED' });
  });
});

/** Posts wrong setup tokens through Dash's Better Auth, each claiming its own forwarded address. */
class SetupCaller {
  readonly fixture = new PasskeyIdentity();

  async attempt(props: {
    path: string;
    forwardedFor: string;
  }): Promise<Response> {
    return this.fixture.identity.handle(
      new Request(`http://localhost:3000/api/auth${props.path}`, {
        method: 'POST',
        headers: {
          origin: passkeyWebOrigin,
          'content-type': 'application/json',
          'x-forwarded-for': props.forwardedFor,
        },
        body: JSON.stringify({
          token: 'guess',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
        }),
      }),
    );
  }

  /** Alternates check and begin until the shared minute's sixty attempts are used. */
  async spendBudget(): Promise<number[]> {
    const statuses = [];
    for (let attempts = 0; attempts < 60; attempts += 1) {
      const response = await this.attempt({
        path: attempts % 2 === 0 ? '/setup/check' : '/setup/begin',
        forwardedFor: `203.0.113.${attempts}`,
      });
      statuses.push(response.status);
    }
    return statuses;
  }
}

describe('TokenSetup rate limit', () => {
  it("pins Better Auth's rate limiter on, leaving setup to its own throttle", async () => {
    const context = await new PasskeyIdentity().identity.auth.$context;

    expect(context.rateLimit.enabled).toBe(true);
    expect(context.rateLimit.customRules).toMatchObject({
      '/setup/check': false,
      '/setup/begin': false,
    });
  });

  it('shares one budget between check and begin, whatever address the caller claims', async () => {
    const caller = new SetupCaller();
    await caller.fixture.issueToken();

    const statuses = await caller.spendBudget();
    const refused = await caller.attempt({
      path: '/setup/check',
      forwardedFor: '198.51.100.1',
    });

    expect(statuses).toEqual(Array.from({ length: 60 }, () => 401));
    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ code: 'SETUP_RATE_LIMITED' });
    expect(refused.headers.get('retry-after')).toMatch(/^\d+$/u);
  });

  it('answers SETUP_CLOSED, not 429, once setup has closed', async () => {
    const caller = new SetupCaller();
    const token = await caller.fixture.issueToken();
    await caller.spendBudget();
    const context = await caller.fixture.identity.auth.$context;
    await context.internalAdapter.createUser(
      { name: 'Grace', email: 'grace@example.com' },
      { method: 'test' },
    );

    const response = await caller.fixture.browser().checkSetup({ token });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SETUP_CLOSED' });
  });
});

describe('TokenSetup once someone has signed up', () => {
  it('rejects the setup token, even one still stored, once a person exists', async () => {
    const fixture = new PasskeyIdentity();
    const token = await fixture.issueToken();
    const context = await fixture.identity.auth.$context;
    await context.internalAdapter.createUser(
      { name: 'Grace', email: 'grace@example.com' },
      { method: 'test' },
    );

    const response = await fixture.browser().beginSetup({ token });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SETUP_CLOSED' });
  });

  it('rejects a second setup with the token the first one used', async () => {
    const fixture = new PasskeyIdentity();
    const token = await fixture.issueToken();
    await fixture.browser().setUp({ token });

    const response = await fixture.browser().beginSetup({ token });

    expect(response.status).toBe(403);
    expect(fixture.tables.user).toHaveLength(1);
  });

  it('refuses to finish a setup begun before someone else finished theirs', async () => {
    const fixture = new PasskeyIdentity();
    const token = await fixture.issueToken();
    const late = fixture.browser();
    const { enrolment } = setupEnrolmentSchema.parse(
      await (
        await late.beginSetup({ token, email: 'late@example.com' })
      ).json(),
    );
    await fixture.browser().setUp({ token });

    const response = await late.registerPasskey({
      context: enrolment,
      createSession: true,
    });

    expect(response.status).toBe(403);
    expect(fixture.tables.user).toHaveLength(1);
    expect(fixture.tables.passkey).toHaveLength(1);
  });
});

describe('TokenSetup enrolment', () => {
  it('creates the first person with their passkey and signs them in', async () => {
    const fixture = new PasskeyIdentity();
    const browser = fixture.browser();

    const response = await browser.setUp({ token: await fixture.issueToken() });
    const session = await browser.get('/get-session');

    expect(response.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { email: 'ada@example.com', name: 'Ada Lovelace', kind: 'user' },
    });
    expect(fixture.tables.passkey).toEqual([
      expect.objectContaining({ userId: fixture.tables.user[0]?.id }),
    ]);
    expect(fixture.tables.setupToken).toEqual([]);
  });

  it('spends an enrolment once', async () => {
    const fixture = new PasskeyIdentity();
    const token = await fixture.issueToken();
    const browser = fixture.browser();
    const { enrolment } = setupEnrolmentSchema.parse(
      await (await browser.beginSetup({ token })).json(),
    );
    await browser.registerPasskey({ context: enrolment, createSession: true });
    await browser.signOut();

    const replay = await fixture
      .browser()
      .registerPasskey({ context: enrolment, createSession: true });

    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({
      code: 'PASSKEY_ENROLMENT_REJECTED',
    });
  });

  it('goes setup, sign out, then passkey sign-in', async () => {
    const fixture = new PasskeyIdentity();
    const browser = await fixture.firstPerson();

    await browser.signOut();
    const signedOut = await browser.get('/get-session');
    const signIn = await browser.signIn();
    const signedIn = await browser.get('/get-session');

    expect(await signedOut.json()).toBeNull();
    expect(signIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({
      user: { email: 'ada@example.com' },
    });
  });
});
