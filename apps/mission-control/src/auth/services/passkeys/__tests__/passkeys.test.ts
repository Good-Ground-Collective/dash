import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { PasskeyBrowser } from '#src/auth/__tests__/support/passkey-browser.ts';
import { PasskeyIdentity } from '#src/auth/__tests__/support/passkey-identity.ts';
import { RecoveryPerson } from '#src/auth/__tests__/support/recovery-person.ts';
import { ServicePrincipalEnrolment } from '#src/auth/__tests__/support/service-principal-enrolment.ts';

const passkeyListSchema = z.array(
  z.object({ id: z.string(), name: z.string().nullish() }),
);

/** The new passkey as verify-registration answers it, with the fields the web's `passkeySchema` reads. */
const addedPasskeySchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  createdAt: z.coerce.date(),
  deviceType: z.string(),
  backedUp: z.boolean(),
});

const selectionSchema = z.object({
  authenticatorSelection: z.looseObject({}),
});

class PasskeyManagement {
  readonly fixture = new PasskeyIdentity();

  async listed(
    browser: PasskeyBrowser,
  ): Promise<z.infer<typeof passkeyListSchema>> {
    const response = await browser.get('/passkey/list-user-passkeys');
    return passkeyListSchema.parse(await response.json());
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

describe('WebAuthnPasskeys enrolments with a session', () => {
  it('refuses a recovery enrolment from a signed-in browser and leaves the code unspent', async () => {
    const person = new RecoveryPerson();
    const signedIn = await person.signedIn();
    const [code = ''] = await person.savedCodes(signedIn);

    const refused = await person.recover(signedIn, { code });
    const later = await person.recover(person.fixture.browser(), { code });

    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({
      code: 'PASSKEY_ENROLMENT_REJECTED',
    });
    expect(later.status).toBe(200);
    expect(person.fixture.tables.passkey).toHaveLength(2);
  });

  it('refuses a setup enrolment from a signed-in browser', async () => {
    const { fixture } = new PasskeyManagement();
    const token = await fixture.issueToken();
    const begun = await fixture.browser().beginSetup({ token });
    const { enrolment } = z
      .object({ enrolment: z.string() })
      .parse(await begun.json());
    const signedIn = fixture.browser();
    await signedIn.setUp({ token });

    const refused = await signedIn.registerPasskey({
      context: enrolment,
      createSession: true,
    });

    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({
      code: 'PASSKEY_ENROLMENT_REJECTED',
    });
    expect(fixture.tables.passkey).toHaveLength(1);
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

describe('WebAuthnPasskeys adding on another device', () => {
  it('adds a passkey on another device and answers with it', async () => {
    const browser = await new PasskeyManagement().fixture.firstPerson();

    const options = await browser.registrationOptions({
      authenticatorAttachment: 'cross-platform',
    });
    const selection = selectionSchema.parse(
      await options.clone().json(),
    ).authenticatorSelection;
    const added = await browser.verifyRegistration(options, { name: 'Phone' });

    expect(selection).toMatchObject({
      authenticatorAttachment: 'cross-platform',
      residentKey: 'required',
      userVerification: 'required',
    });
    expect(added.status).toBe(200);
    expect(addedPasskeySchema.parse(await added.json()).name).toBe('Phone');
  });
});
