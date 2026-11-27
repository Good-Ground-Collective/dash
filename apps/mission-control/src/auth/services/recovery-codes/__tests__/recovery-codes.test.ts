import { describe, expect, it } from 'vitest';

import { RecoveryPerson } from '#src/auth/__tests__/support/recovery-person.ts';

describe('StoredRecoveryCodes generating', () => {
  it('generates ten distinct codes formatted xxxx-xxxx, storing only hashes', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();

    const { codes } = await person.generate(browser);
    const stored = JSON.stringify(person.fixture.tables.recoveryCode);

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/u);
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replace('-', ''));
    }
  });

  it('needs a session', async () => {
    const person = new RecoveryPerson();
    await person.signedIn();

    const response = await person.fixture
      .browser()
      .post('/recovery-codes/generate', '{}');

    expect(response.status).toBe(401);
  });

  it('needs a fresh sign-in, like other credential changes', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();
    person.fixture.ageSessions({ minutes: 16 });

    const response = await browser.post('/recovery-codes/generate', '{}');

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FRESH' });
  });

  it('reports no confirmed codes until a set is confirmed', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();

    const before = await person.status(browser);
    await person.generate(browser);
    const pending = await person.status(browser);

    expect(before).toEqual({ confirmed: false, remaining: 0 });
    expect(pending).toEqual({ confirmed: false, remaining: 0 });
  });
});

describe('StoredRecoveryCodes confirming', () => {
  it('confirms a set and reports ten remaining', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();
    const { setId } = await person.generate(browser);

    const response = await person.confirm(browser, setId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ confirmed: true, remaining: 10 });
  });

  it('confirms without a fresh sign-in, since only generating hands out the set id', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();
    const { setId } = await person.generate(browser);
    person.fixture.ageSessions({ minutes: 16 });

    const response = await person.confirm(browser, setId);

    expect(response.status).toBe(200);
  });

  it('discards an unconfirmed set when a new one is generated, as a reload does', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();
    const first = await person.generate(browser);
    await person.generate(browser);

    const response = await person.confirm(browser, first.setId);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'RECOVERY_CODE_SET_NOT_PENDING',
    });
    expect(person.fixture.tables.recoveryCode).toHaveLength(10);
  });

  it('refuses to confirm a set twice', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();
    const { setId } = await person.generate(browser);
    await person.confirm(browser, setId);

    const again = await person.confirm(browser, setId);

    expect(again.status).toBe(409);
  });
});

describe('StoredRecoveryCodes regenerating', () => {
  it('keeps the old codes working until a regenerated set is confirmed, then drops them', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();
    const [oldCode = ''] = await person.savedCodes(browser);
    const regenerated = await person.generate(browser);

    const beforeConfirm = await person.redeem(person.fixture.browser(), {
      code: oldCode,
    });
    await person.confirm(browser, regenerated.setId);
    const afterConfirm = await person.redeem(person.fixture.browser(), {
      code: oldCode,
    });
    const newCode = await person.redeem(person.fixture.browser(), {
      code: regenerated.codes[0] ?? '',
    });

    expect(beforeConfirm.status).toBe(200);
    expect(afterConfirm.status).toBe(401);
    expect(newCode.status).toBe(200);
    expect(await person.status(browser)).toEqual({
      confirmed: true,
      remaining: 10,
    });
  });

  it('refuses another person’s set id', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();
    const { setId } = await person.generate(browser);
    const context = await person.fixture.identity.auth.$context;
    const grace = await context.internalAdapter.createUser(
      { name: 'Grace', email: 'grace@example.com' },
      { method: 'test' },
    );

    await expect(
      person.fixture.identity.recovery.codes.confirm({
        context,
        userId: grace.id,
        setId,
      }),
    ).rejects.toMatchObject({
      body: { code: 'RECOVERY_CODE_SET_NOT_PENDING' },
    });
  });
});
