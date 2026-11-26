import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  const { missionControlUrl } = projectSettingsSchema.parse(
    testInfo.project.metadata,
  );
  const context = await browser.newContext({ baseURL: baseURL ?? '' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  page = await context.newPage();
  await page.request.post(`${missionControlUrl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControlUrl}/api/auth/__stub/sign-in`);
});

test('settings links to an empty service accounts page', async () => {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Manage' }).click();

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
