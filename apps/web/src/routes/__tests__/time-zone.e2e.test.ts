import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });
const savesSchema = z.object({ saves: z.number() });

test.describe.configure({ mode: 'serial' });

let missionControl = '';

class TimeZone {
  /** Signs in afresh, with Mission Control holding its default zone. */
  static async signIn(page: Page): Promise<void> {
    await page.request.post(`${missionControl}/api/auth/__stub/reset`);
    await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
  }

  static panel(page: Page) {
    return page.getByRole('region', { name: 'Time zone' });
  }

  static async saves(page: Page): Promise<number> {
    const response = await page.request.get(
      `${missionControl}/api/people/me/time-zone/__stub/saves`,
    );
    return savesSchema.parse(await response.json()).saves;
  }
}

test.beforeAll(async ({}, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
});

test.describe('a browser in London', () => {
  test.use({ timezoneId: 'Europe/London' });

  test('saves its zone after sign-in, and Settings shows it', async ({
    page,
  }) => {
    await TimeZone.signIn(page);

    await page.goto('/settings');

    await expect(TimeZone.panel(page)).toContainText('Europe/London');
    await expect(TimeZone.panel(page)).toContainText('Follows your browser');
    await page.reload();
    await expect(TimeZone.panel(page)).toContainText('Europe/London');
    expect(await TimeZone.saves(page)).toBe(1);
  });

  test('renders the stored zone while the save is still in flight', async ({
    page,
  }) => {
    await TimeZone.signIn(page);
    await page.route('**/api/people/me/time-zone', () => undefined);

    await page.goto('/settings');

    await expect(TimeZone.panel(page)).toContainText('Eastern Time');
    await expect(page.getByRole('heading', { name: 'Passkeys' })).toBeVisible();
  });
});

test.describe('a browser in New York', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('sends nothing when the zone already matches', async ({ page }) => {
    await TimeZone.signIn(page);

    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(TimeZone.panel(page)).toContainText('America/New_York');
    expect(await TimeZone.saves(page)).toBe(0);
  });
});
