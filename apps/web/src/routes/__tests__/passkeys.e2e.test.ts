import {
  type Browser,
  type CDPSession,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { z } from 'zod';

/** Set by the `passkeys` project in playwright.config.ts: the stub by default, or a live Mission Control. */
export const passkeyProjectSettingsSchema = z.object({
  missionControlUrl: z.url(),
  setupToken: z.string().min(1),
  live: z.boolean(),
});

/** One browser page with Chromium's virtual platform authenticator, shared by the serial flow. */
class PasskeyDevice {
  readonly page: Page;
  private readonly cdp: CDPSession;
  private readonly authenticatorId: string;

  private constructor(props: {
    page: Page;
    cdp: CDPSession;
    authenticatorId: string;
  }) {
    this.page = props.page;
    this.cdp = props.cdp;
    this.authenticatorId = props.authenticatorId;
  }

  /** Plugs in a second authenticator, a roaming security key, for as long as `use` runs. Mission Control excludes credentials the platform authenticator already holds, so a second passkey needs a second device. */
  async withSecurityKey(use: () => Promise<void>): Promise<void> {
    const { authenticatorId } = await this.cdp.send(
      'WebAuthn.addVirtualAuthenticator',
      {
        options: {
          protocol: 'ctap2',
          transport: 'usb',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      },
    );
    try {
      await use();
    } finally {
      await this.cdp.send('WebAuthn.removeVirtualAuthenticator', {
        authenticatorId,
      });
    }
  }

  /** With presence off, prompts wait for a person who never comes. The virtual authenticator otherwise answers even a conditional (autofill) request by itself. */
  async setPresence(present: boolean): Promise<void> {
    await this.cdp.send('WebAuthn.setAutomaticPresenceSimulation', {
      authenticatorId: this.authenticatorId,
      enabled: present,
    });
  }

  /** Requests the page itself makes to Mission Control's session lookup, which is the renewal. Server renders aren't seen here. */
  async renewalsDuring(action: () => Promise<void>): Promise<number> {
    let renewals = 0;
    const count = (request: { url: () => string }): void => {
      if (request.url() === `${missionControlUrl}/api/auth/get-session`) {
        renewals += 1;
      }
    };
    this.page.on('request', count);
    await action();
    await this.page.waitForLoadState('networkidle');
    this.page.off('request', count);
    return renewals;
  }

  static async open(props: {
    browser: Browser;
    baseURL: string;
  }): Promise<PasskeyDevice> {
    const context = await props.browser.newContext({
      baseURL: props.baseURL,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send(
      'WebAuthn.addVirtualAuthenticator',
      {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      },
    );
    return new PasskeyDevice({ page, cdp, authenticatorId });
  }
}

test.describe.configure({ mode: 'serial' });

let device: PasskeyDevice;
let missionControlUrl = '';
let setupToken = '';

test.beforeAll(async ({ browser, baseURL, request }, testInfo) => {
  const settings = passkeyProjectSettingsSchema.parse(
    testInfo.project.metadata,
  );
  missionControlUrl = settings.missionControlUrl;
  setupToken = settings.setupToken;
  if (!settings.live) {
    await request.post(`${missionControlUrl}/api/auth/__stub/reset`);
  }
  device = await PasskeyDevice.open({ browser, baseURL: baseURL ?? '' });
});

test.afterEach(async () => {
  await device.page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('setup step 1 catches a wrong token before asking for the account', async () => {
  const { page } = device;
  await page.goto('/setup');
  await expect(page.getByText('Step 1 of 4')).toBeVisible();

  await page.getByLabel('Setup token').fill('not-the-token');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('alert')).toHaveText(/isn’t the current one/u);
  await expect(
    page.getByRole('heading', { name: 'Set up Dash' }),
  ).toBeVisible();
  await expect(page.getByLabel('Setup token')).toBeFocused();
  await expect(page.getByLabel('Setup token')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Setup token')).toHaveAccessibleDescription(
    /isn’t the current one/u,
  );
  await expect(page.getByLabel('Display name')).toHaveCount(0);
});

test('a setup someone else finished in the meantime offers sign-in', async () => {
  const { page } = device;
  await page.goto('/setup');
  await page.route(`${missionControlUrl}/api/auth/setup/check`, (route) =>
    route.fulfill({
      status: 403,
      json: { code: 'SETUP_CLOSED', message: 'closed' },
    }),
  );

  await page.getByLabel('Setup token').fill(setupToken);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(
    page.getByRole('heading', { name: 'Setup is done' }),
  ).toBeFocused();
  await expect(
    page
      .getByRole('region', { name: 'Setup is done' })
      .getByRole('link', { name: 'Sign in' }),
  ).toHaveAttribute('href', '/sign-in');
});

test('a token begin rejects sends you back to step 1', async () => {
  const { page } = device;
  await page.goto('/setup');
  await page.getByLabel('Setup token').fill(setupToken);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await page.route(`${missionControlUrl}/api/auth/setup/begin`, (route) =>
    route.fulfill({
      status: 401,
      json: { code: 'SETUP_TOKEN_REJECTED', message: 'rejected' },
    }),
  );

  await page.getByLabel('Display name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByRole('button', { name: 'Register passkey' }).click();

  await expect(
    page.getByRole('heading', { name: 'Set up Dash' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(/isn’t the current one/u);
  await expect(page.getByLabel('Setup token')).toBeFocused();
});

test('setup goes token, account, passkey, codes, second passkey, then GitHub, without the token in the URL', async () => {
  const { page } = device;
  await page.goto('/setup');

  await page.getByLabel('Setup token').fill(setupToken);
  await page.getByRole('button', { name: 'Continue' }).click();

  const account = page.getByRole('heading', { name: 'Create your account' });
  await expect(account).toBeFocused();
  await expect(account).toHaveAccessibleDescription('Step 2 of 4');
  await expect(page).toHaveURL('/setup');
  await page.getByLabel('Display name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByRole('button', { name: 'Register passkey' }).click();

  await expect(page).toHaveURL('/setup/recovery-codes?onboarding');
  await page.getByLabel('I’ve saved these codes somewhere safe').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL('/setup/second-passkey');
  await page.getByRole('link', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL('/setup/github');
  await page.getByRole('link', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL('/');
});

test('a signed-in page load renews the session from the browser', async () => {
  const renewals = await device.renewalsDuring(async () => {
    await device.page.goto('/');
  });

  expect(renewals).toBe(1);
});

test('settings adds, renames and removes passkeys, keeping the last', async () => {
  const { page } = device;
  await page
    .getByRole('button', { name: 'Account, signed in as Ada Lovelace' })
    .click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Passkeys' })
    .click();
  await expect(page).toHaveURL('/settings/passkeys');
  const passkeys = page.getByRole('list', { name: 'Your passkeys' });

  await expect(passkeys.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove' })).toBeDisabled();

  await device.withSecurityKey(async () => {
    await page.getByLabel('Add a passkey').fill('Backup key');
    await page.getByRole('button', { name: 'Add passkey' }).click();
    await expect(passkeys.getByRole('listitem')).toHaveCount(2);
  });

  await page.getByRole('button', { name: 'Rename Backup key' }).click();
  await page.getByLabel('New name for Backup key').fill('Spare laptop');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(passkeys.getByText('Spare laptop')).toBeVisible();

  await passkeys
    .getByRole('listitem')
    .filter({ hasText: 'Spare laptop' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await page.getByRole('button', { name: 'Remove passkey' }).click();
  await expect(passkeys.getByRole('listitem')).toHaveCount(1);
});

test('signed out: no renewals, autofill-ready sign-in, setup closed', async () => {
  const { page } = device;
  await device.setPresence(false);
  await page.goto('/settings/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/sign-in');

  const renewals = await device.renewalsDuring(async () => {
    await page.goto('/');
  });

  expect(renewals).toBe(0);
  await page.goto('/sign-in');
  await expect(page.getByLabel('Email')).toHaveAttribute(
    'autocomplete',
    'username webauthn',
  );
  await page.goto('/setup');
  await expect(page.getByRole('img', { name: 'Signed out' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Setup is done' }),
  ).toBeVisible();
});

test('signs back in through passkey autofill, without a prompt', async () => {
  const { page } = device;
  await device.setPresence(true);

  await page.goto('/sign-in');

  await expect(
    page.getByRole('button', { name: 'Account, signed in as Ada Lovelace' }),
  ).toBeVisible();
  await expect(page).toHaveURL('/');
});
