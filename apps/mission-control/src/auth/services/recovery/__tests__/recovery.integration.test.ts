import { describe, expect, it } from 'vitest';

import { RecoveryPerson } from '#src/auth/__tests__/support/recovery-person.ts';
import { recoveryEnrolmentSchema } from '#src/auth/contracts/recovery.ts';

describe('CodeRecovery racing ceremonies', () => {
  it('spends a code once when two ceremonies both started before either finished', async () => {
    const person = new RecoveryPerson();
    const [code = ''] = await person.savedCodes(await person.signedIn());
    const [first, second] = [
      person.fixture.browser(),
      person.fixture.browser(),
    ];
    const enrolments = await Promise.all(
      [first, second].map(async (browser) =>
        recoveryEnrolmentSchema.parse(
          await (await person.redeem(browser, { code })).json(),
        ),
      ),
    );
    const firstOptions = await first.registrationOptions({
      context: enrolments[0]?.enrolment ?? '',
    });
    const secondOptions = await second.registrationOptions({
      context: enrolments[1]?.enrolment ?? '',
    });

    const won = await first.verifyRegistration(firstOptions, {
      createSession: true,
    });
    const lost = await second.verifyRegistration(secondOptions, {
      createSession: true,
    });

    expect([firstOptions.status, secondOptions.status]).toEqual([200, 200]);
    expect(won.status).toBe(200);
    expect(lost.status).toBe(401);
    expect(await lost.json()).toMatchObject({
      code: 'PASSKEY_ENROLMENT_REJECTED',
    });
    expect(person.fixture.tables.passkey).toHaveLength(2);
    expect(person.fixture.tables.session).toHaveLength(1);
    expect(
      person.fixture.tables.recoveryCode.filter((row) => row.state === 'used'),
    ).toHaveLength(1);
    expect(await (await second.get('/get-session')).json()).toBeNull();
  });
});

describe('CodeRecovery sessions', () => {
  it('signs the person out everywhere else when a code registers a passkey', async () => {
    const person = new RecoveryPerson();
    const original = await person.signedIn();
    const [code = ''] = await person.savedCodes(original);
    const device = person.fixture.browser();

    await person.recover(device, { code });

    expect(await (await original.get('/get-session')).json()).toBeNull();
    expect(await (await device.get('/get-session')).json()).toMatchObject({
      user: { email: person.email },
    });
    expect(person.fixture.tables.session).toHaveLength(1);
  });

  it('signs the person out everywhere else when a break-glass link registers a passkey', async () => {
    const person = new RecoveryPerson();
    const original = await person.signedIn();
    const link = await person.fixture.identity.recovery.issueLink({
      context: await person.fixture.identity.auth.$context,
      email: person.email,
    });
    const device = person.fixture.browser();

    await device.registerPasskey({
      context:
        new URLSearchParams(new URL(link.url).hash.slice(1)).get('enrolment') ??
        '',
      createSession: true,
    });

    expect(await (await original.get('/get-session')).json()).toBeNull();
    expect(person.fixture.tables.session).toHaveLength(1);
  });

  it('keeps the person’s sessions when the code is spent mid-ceremony', async () => {
    const person = new RecoveryPerson();
    const original = await person.signedIn();
    const [code = ''] = await person.savedCodes(original);
    const device = person.fixture.browser();
    const { enrolment } = recoveryEnrolmentSchema.parse(
      await (await person.redeem(device, { code })).json(),
    );
    const options = await device.registrationOptions({ context: enrolment });
    for (const row of person.fixture.tables.recoveryCode) {
      row.state = 'used';
    }

    const refused = await device.verifyRegistration(options, {
      createSession: true,
    });

    expect(refused.status).toBe(401);
    expect(await (await original.get('/get-session')).json()).toMatchObject({
      user: { email: person.email },
    });
  });
});
