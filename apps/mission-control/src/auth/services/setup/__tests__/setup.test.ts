import { describe, expect, it } from 'vitest';

import { PasskeyIdentity } from '#src/auth/__tests__/support/passkey-identity.ts';
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
