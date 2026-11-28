import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let missionControl = '';

class Appearance {
  /** Signs in afresh with no saved mode, and opens Settings. */
  static async start(page: Page): Promise<void> {
    await page.request.post(`${missionControl}/api/auth/__stub/reset`);
    await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
    await page.goto('/settings/appearance');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  }

  static mode(page: Page) {
    return page.getByRole('radiogroup', { name: 'Mode' });
  }
}

test.beforeAll(async ({}, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
});

test('switching to dark applies at once and survives a reload', async ({
  page,
}) => {
  await Appearance.start(page);
  const html = page.locator('html');
  const mode = Appearance.mode(page);
  await expect(mode.getByRole('radio', { name: 'Light' })).toBeChecked();

  await mode.getByRole('radio', { name: 'Dark' }).click();

  await expect(html).toHaveAttribute('data-mode', 'dark');
  await expect(mode.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await page.waitForLoadState('networkidle');
  const served = await page.request.get('/settings/appearance');
  expect(await served.text()).toContain('data-mode="dark"');
  await page.reload();
  await expect(html).toHaveAttribute('data-mode', 'dark');
});

test('holds the toggles while a save is in flight, then keeps the choice', async ({
  page,
}) => {
  await Appearance.start(page);
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/appearance/update', async (route) => {
    await held;
    await route.continue();
  });
  const mode = Appearance.mode(page);

  await mode.getByRole('radio', { name: 'Dark' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(mode.getByRole('radio', { name: 'Light' })).toBeDisabled();
  release();
  await expect(mode.getByRole('radio', { name: 'Light' })).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
});

test('puts the saved mode back when Mission Control refuses', async ({
  page,
}) => {
  await Appearance.start(page);
  await page.route('**/api/auth/appearance/update', async (route) =>
    route.fulfill({ status: 500, json: { code: 'INTERNAL' } }),
  );
  const mode = Appearance.mode(page);

  await mode.getByRole('radio', { name: 'Dark' }).click();

  await expect(page.getByRole('alert')).toHaveText(
    'Mission Control didn’t save that. Try again.',
  );
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect(mode.getByRole('radio', { name: 'Light' })).toBeChecked();
});

test('another device renders the saved mode on its first page, before any cookie', async ({
  browser,
  baseURL,
}) => {
  const device = await browser.newContext({ baseURL: baseURL ?? '' });
  await device.request.post(`${missionControl}/api/auth/__stub/reset`);
  await device.request.post(`${missionControl}/api/auth/__stub/sign-in`);
  await device.request.post(`${missionControl}/api/auth/appearance/update`, {
    data: { theme: 'characters', mode: 'dark' },
  });

  const served = await device.request.get('/');

  expect(await served.text()).toContain('data-mode="dark"');
  expect(served.headers()['set-cookie']).toContain('dash-mode=dark');
  await device.close();
});
