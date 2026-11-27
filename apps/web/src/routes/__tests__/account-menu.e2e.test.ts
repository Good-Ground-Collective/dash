import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  const { missionControlUrl } = projectSettingsSchema.parse(
    testInfo.project.metadata,
  );
  page = await browser.newPage({ baseURL: baseURL ?? '' });
  await page.request.post(`${missionControlUrl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControlUrl}/api/auth/__stub/sign-in`);
});

test('the account menu names the viewer and shows the build', async () => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Account, signed in as Ada Lovelace' })
    .click();

  const menu = page.getByRole('menu');
  await expect(
    menu.getByRole('group', { name: /Ada Lovelace/u }),
  ).toBeVisible();
  for (const name of ['Settings', 'Service accounts', 'Sign out']) {
    await expect(menu.getByRole('menuitem', { name })).toBeVisible();
  }
  await expect(
    menu.getByRole('menuitem', { name: 'Release v1.1.1' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/Good-Ground-Collective/dash/releases/tag/v1.1.1',
  );
  await expect(
    menu.getByRole('menuitem', { name: 'Commit 7615036' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/Good-Ground-Collective/dash/commit/7615036f0c2b9a8e1d4f5a6b7c8d9e0f1a2b3c4d',
  );
});

test('the keyboard reaches settings from the menu', async () => {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await page
    .getByRole('button', { name: 'Account, signed in as Ada Lovelace' })
    .press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL('/settings');
});

test('the page stays clickable after the menu closes, and sign out returns to sign-in', async () => {
  await page
    .getByRole('button', { name: 'Account, signed in as Ada Lovelace' })
    .click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await expect(page).toHaveURL('/sign-in');
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Signed out' })).toBeVisible();
});
