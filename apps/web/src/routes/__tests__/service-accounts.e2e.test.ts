import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  const { missionControlUrl } = projectSettingsSchema.parse(
    testInfo.project.metadata,
  );
  missionControl = missionControlUrl;
  const context = await browser.newContext({ baseURL: baseURL ?? '' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.request.post(`${missionControlUrl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControlUrl}/api/auth/__stub/sign-in`);
});

test('settings links to an empty service accounts page', async () => {
  await page.goto('/settings');
  await expect(page).toHaveURL('/settings/profile');
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Service accounts' })
    .click();

  await expect(page).toHaveURL('/settings/service-accounts');
  await expect(
    page.getByRole('heading', { name: 'No service accounts yet' }),
  ).toBeVisible();
});

test('creating a bench account shows its key once, with a copy button', async () => {
  await page.getByRole('button', { name: 'New service account' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Studio Mac');
  await page.getByLabel('Bench ID').fill('studio-mac');
  await page.getByLabel('What it’s for').fill('The desk machine');
  await page.getByRole('button', { name: 'Create and show key' }).click();

  const key = page.getByLabel('API key');
  await expect(key).toHaveValue(/^dash_dev_/u);
  const secret = await key.inputValue();
  await page.keyboard.press('Escape');
  await expect(key).toBeVisible();
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    secret,
  );

  await page.getByRole('button', { name: 'I’ve stored it' }).click();
  await expect(page.getByLabel('API key')).toBeHidden();
  const keys = page.getByRole('list', { name: 'Keys for Studio Mac' });
  await expect(keys.getByText(`${secret.slice(0, 15)}…`)).toBeVisible();
  await expect(keys.getByText('Never used · Never expires')).toBeVisible();
  await expect(page.getByText(secret)).toHaveCount(0);
});

test('a taken bench id keeps the dialog open with what was typed', async () => {
  await page.getByRole('button', { name: 'New service account' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Studio Mac again');
  await page.getByLabel('Bench ID').fill('studio-mac');
  await page.getByLabel('What it’s for').fill('Same desk');
  await page.getByRole('button', { name: 'Create and show key' }).click();

  const dialog = page.getByRole('dialog', { name: 'New service account' });
  await expect(dialog.getByRole('alert')).toHaveText(/already exists/u);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'Studio Mac again',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('an agent account’s key expires', async () => {
  await page.getByRole('button', { name: 'New service account' }).click();
  await page.getByRole('radio', { name: /Agent/u }).click();
  await page.getByLabel('Name', { exact: true }).fill('CI reviewer');
  await page.getByLabel('Agent name').fill('ci-reviewer');
  await page.getByLabel('What it’s for').fill('Runs in Actions');
  await page.getByRole('button', { name: 'Create and show key' }).click();
  await page.getByRole('button', { name: 'I’ve stored it' }).click();

  await expect(
    page
      .getByRole('list', { name: 'Keys for CI reviewer' })
      .getByText(/Never used · Expires /u),
  ).toBeVisible();
});

test('revoking a key and removing an account', async () => {
  const keys = page.getByRole('list', { name: 'Keys for Studio Mac' });
  await keys.getByRole('button', { name: /^Revoke / }).click();
  await page.getByRole('button', { name: 'Revoke key' }).click();
  await expect(keys).toBeHidden();
  await expect(page.getByText('No keys. Issue one')).toBeVisible();

  await page.getByRole('button', { name: 'Remove CI reviewer' }).click();
  await page.getByRole('button', { name: 'Remove account' }).click();
  await expect(
    page.getByRole('heading', { name: 'CI reviewer', exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Studio Mac', exact: true }),
  ).toBeVisible();
});

test('a stale session confirms with a passkey, then issues the key with the account’s scopes', async () => {
  await page.goto('/settings/passkeys');
  await page.getByLabel('Add a passkey').fill('Desk');
  await page.getByRole('button', { name: 'Add passkey' }).click();
  await expect(
    page.getByRole('list', { name: 'Your passkeys' }).getByText('Desk'),
  ).toBeVisible();
  await page.request.post(`${missionControl}/api/auth/__stub/age-session`);

  await page.goto('/settings/service-accounts');
  await page.getByRole('button', { name: 'New key for Studio Mac' }).click();
  await page.getByRole('button', { name: 'Confirm with a passkey' }).click();

  await expect(page.getByLabel('API key')).toHaveValue(/^dash_dev_/u);
  await page.getByRole('button', { name: 'I’ve stored it' }).click();
  const keys = page.getByRole('list', { name: 'Keys for Studio Mac' });
  await expect(keys.getByText('Heartbeats')).toBeVisible();
  await expect(keys.getByText('Telemetry')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm with a passkey' }),
  ).toBeHidden();
});
