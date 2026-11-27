import { expect, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let missionControl = '';

test.beforeAll(async ({ request }, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
  await request.post(`${missionControl}/api/auth/__stub/reset`);
});

test('switching to dark applies at once and survives a reload', async ({
  page,
}) => {
  await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
  await page.goto('/settings');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-mode', 'light');

  const mode = page.getByRole('radiogroup', { name: 'Mode' });
  await expect(mode.getByRole('radio', { name: 'Light' })).toBeChecked();
  await mode.getByRole('radio', { name: 'Dark' }).click();

  await expect(html).toHaveAttribute('data-mode', 'dark');
  await expect(mode.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await page.waitForLoadState('networkidle');

  const served = await page.request.get('/settings');
  expect(await served.text()).toContain('data-mode="dark"');
  await page.reload();
  await expect(html).toHaveAttribute('data-mode', 'dark');
});

test('another device renders the saved mode on its first page, before any cookie', async ({
  browser,
  baseURL,
}) => {
  const device = await browser.newContext({ baseURL: baseURL ?? '' });
  await device.request.post(`${missionControl}/api/auth/__stub/sign-in`);

  const served = await device.request.get('/');

  expect(await served.text()).toContain('data-mode="dark"');
  expect(served.headers()['set-cookie']).toContain('dash-mode=dark');
  await device.close();
});
