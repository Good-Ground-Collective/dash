import { describe, expect, it, vi } from 'vitest';

import { RecoveryPerson } from '#src/auth/__tests__/support/recovery-person.ts';
import { recoveryEnrolmentSchema } from '#src/auth/contracts/recovery.ts';
import { RecoveryPersonNotFoundError } from '#src/auth/errors.ts';

describe('CodeRecovery with a code', () => {
  it('registers a new passkey on a new device and signs in', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    const device = person.fixture.browser();

    const response = await person.recover(device, { code });
    const session = await device.get('/get-session');

    expect(response.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { email: person.email },
    });
    expect(person.fixture.tables.passkey).toHaveLength(2);
    expect(await person.status(device)).toEqual({
      confirmed: true,
      remaining: 9,
    });
  });

  it('leaves a session fresh enough to regenerate codes straight away', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    person.fixture.ageSessions({ minutes: 60 });
    const device = person.fixture.browser();
    await person.recover(device, { code });

    const response = await device.post('/recovery-codes/generate', '{}');

    expect(response.status).toBe(200);
  });

  it('signs in with the new passkey afterwards', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    const device = person.fixture.browser();
    await person.recover(device, { code });
    await device.signOut();

    const signIn = await device.signIn();

    expect(signIn.status).toBe(200);
  });

  it('accepts a code typed in capitals, without its hyphen', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());

    const response = await person.redeem(person.fixture.browser(), {
      code: ` ${code.replace('-', '').toUpperCase()} `,
      email: ' ADA@example.com',
    });

    expect(response.status).toBe(200);
  });
});

describe('CodeRecovery spending codes', () => {
  it('refuses a used code', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    await person.recover(person.fixture.browser(), { code });

    const again = await person.recover(person.fixture.browser(), { code });

    expect(again.status).toBe(401);
    expect(await again.json()).toMatchObject({ code: 'RECOVERY_REJECTED' });
    expect(person.fixture.tables.passkey).toHaveLength(2);
  });

  it('refuses a second ceremony for a code another one already spent', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    const first = person.fixture.browser();
    const second = person.fixture.browser();
    const firstEnrolment = recoveryEnrolmentSchema.parse(
      await (await person.redeem(first, { code })).json(),
    );
    const secondEnrolment = recoveryEnrolmentSchema.parse(
      await (await person.redeem(second, { code })).json(),
    );
    await first.registerPasskey({
      context: firstEnrolment.enrolment,
      createSession: true,
    });

    const late = await second.registerPasskey({
      context: secondEnrolment.enrolment,
      createSession: true,
    });

    expect(late.status).toBe(401);
    expect(person.fixture.tables.passkey).toHaveLength(2);
  });
});

describe('CodeRecovery enrolments', () => {
  it('keeps the code when the passkey ceremony never finishes', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    await person.redeem(person.fixture.browser(), { code });

    const retried = await person.recover(person.fixture.browser(), { code });

    expect(retried.status).toBe(200);
  });

  it('refuses a code from a set that was never confirmed', async () => {
    const person = new RecoveryPerson();
    const browser = await person.signedIn();
    const { codes } = await person.generate(browser);

    const response = await person.redeem(person.fixture.browser(), {
      code: codes[0] ?? '',
    });

    expect(response.status).toBe(401);
  });

  it('refuses an expired enrolment', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    const device = person.fixture.browser();
    const { enrolment } = recoveryEnrolmentSchema.parse(
      await (await person.redeem(device, { code })).json(),
    );
    for (const row of person.fixture.tables.verification) {
      if (row.identifier === enrolment) {
        row.expiresAt = new Date(Date.now() - 1000);
      }
    }

    const response = await device.registerPasskey({
      context: enrolment,
      createSession: true,
    });

    expect(response.status).toBe(401);
  });
});

describe('CodeRecovery refusals', () => {
  it('answers a wrong code, a used code and an unknown email identically', async () => {
    const person = new RecoveryPerson();
    const [code = '', spare = ''] = await person.savedCodes(
      await person.signedIn(),
    );
    await person.recover(person.fixture.browser(), { code });

    const answers = await Promise.all(
      [
        { code: 'aaaa-aaaa' },
        { code },
        { code: spare, email: 'nobody@example.com' },
      ].map(async (attempt) => {
        const response = await person.redeem(person.fixture.browser(), attempt);
        return { status: response.status, body: await response.json() };
      }),
    );

    expect(answers[0]).toEqual({
      status: 401,
      body: {
        code: 'RECOVERY_REJECTED',
        message: expect.any(String),
      },
    });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it('refuses a service principal’s email like any other', async () => {
    const person = new RecoveryPerson();
    await person.signedIn();
    const id = person.fixture.addServicePrincipal();

    const response = await person.redeem(person.fixture.browser(), {
      code: 'aaaa-aaaa',
      email: `svc-${id}@service.invalid`,
    });

    expect(response.status).toBe(401);
  });
});

describe('CodeRecovery rate limit', () => {
  it('rate-limits an email after five attempts, whether or not it exists', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    const browser = person.fixture.browser();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await person.redeem(browser, { code: 'aaaa-aaaa' });
      await person.redeem(browser, {
        code: 'aaaa-aaaa',
        email: 'nobody@example.com',
      });
    }

    const known = await person.redeem(browser, { code });
    const unknown = await person.redeem(browser, {
      code,
      email: 'nobody@example.com',
    });

    expect(known.status).toBe(429);
    expect(known.headers.get('retry-after')).toMatch(/^\d+$/u);
    expect(await known.json()).toMatchObject({
      code: 'RECOVERY_RATE_LIMITED',
    });
    expect(unknown.status).toBe(429);
  });

  it('lets a hundred attempts across emails through, then refuses everyone and warns once without the email', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    const context = await person.fixture.identity.auth.$context;
    const warn = vi.spyOn(context.logger, 'warn').mockReturnValue();
    const browser = person.fixture.browser();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await person.redeem(browser, {
        code: 'aaaa-aaaa',
        email: `guess-${attempt}@example.com`,
      });
      statuses.push(response.status);
    }

    const owner = await person.redeem(browser, { code });
    await person.redeem(browser, { code });

    expect(new Set(statuses)).toEqual(new Set([401]));
    expect(owner.status).toBe(429);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('example.com');
    expect(JSON.stringify(warn.mock.calls)).not.toContain(code);
  });
});

describe('CodeRecovery break-glass links', () => {
  it('issues a 15-minute link to /recover/passkey with the enrolment in the fragment', async () => {
    const person = new RecoveryPerson();
    await person.signedIn();
    const context = await person.fixture.identity.auth.$context;
    const before = Date.now();

    const link = await person.fixture.identity.recovery.issueLink({
      context,
      email: person.email,
    });
    const url = new URL(link.url);

    expect(url.origin).toBe('http://localhost:5173');
    expect(url.pathname).toBe('/recover/passkey');
    expect(url.search).toBe('');
    expect(new URLSearchParams(url.hash.slice(1)).get('enrolment')).toMatch(
      /^recovery-enrolment:/u,
    );
    expect(link.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      15 * 60 * 1000,
    );
    expect(link.expiresAt.getTime() - before).toBeLessThan(16 * 60 * 1000);
  });

  it('registers a new passkey and signs in once, then refuses the same link', async () => {
    const person = new RecoveryPerson();
    await person.signedIn();
    const context = await person.fixture.identity.auth.$context;
    const link = await person.fixture.identity.recovery.issueLink({
      context,
      email: person.email,
    });
    const enrolment =
      new URLSearchParams(new URL(link.url).hash.slice(1)).get('enrolment') ??
      '';
    const device = person.fixture.browser();

    const used = await device.registerPasskey({
      context: enrolment,
      createSession: true,
    });
    const session = await device.get('/get-session');
    const replay = await person.fixture
      .browser()
      .registerPasskey({ context: enrolment, createSession: true });

    expect(used.status).toBe(200);
    expect(await session.json()).toMatchObject({
      user: { email: person.email },
    });
    expect(replay.status).toBe(401);
    expect(person.fixture.tables.passkey).toHaveLength(2);
  });
});

describe('CodeRecovery break-glass recipients', () => {
  it('works for a person who never saved recovery codes', async () => {
    const person = new RecoveryPerson();
    await person.signedIn();
    const context = await person.fixture.identity.auth.$context;
    const link = await person.fixture.identity.recovery.issueLink({
      context,
      email: 'Ada@Example.com',
    });

    expect(link.url).toContain('#enrolment=');
  });

  it('refuses an email that belongs to nobody', async () => {
    const person = new RecoveryPerson();
    await person.signedIn();
    const context = await person.fixture.identity.auth.$context;

    await expect(
      person.fixture.identity.recovery.issueLink({
        context,
        email: 'nobody@example.com',
      }),
    ).rejects.toThrow(RecoveryPersonNotFoundError);
  });
});
