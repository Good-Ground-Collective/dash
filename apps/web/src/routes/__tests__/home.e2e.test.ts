import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';

/** The setup checklist card as the person sees it. */
class Card {
  static region(): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name: 'Finish setting up' });
  }

  static row(title: string): ReturnType<Page['getByRole']> {
    return Card.region().getByRole('listitem').filter({ hasText: title });
  }
}

/** Puts the stub's person into the state an item checks. */
class Progress {
  static async connectGitHub(): Promise<void> {
    await page.request.post(
      `${missionControl}/integrations/github/__stub/scenario?name=linked`,
    );
  }

  /** Registers a passkey through the stub, which trusts any credential. */
  static async addPasskey(id: string): Promise<void> {
    await page.request.post(
      `${missionControl}/api/auth/passkey/verify-registration`,
      { data: { response: { id }, name: id } },
    );
  }
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
  const context = await browser.newContext({ baseURL: baseURL ?? '' });
  page = await context.newPage();
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
  await Progress.addPasskey('this-computer');
});

test('a fresh account sees GitHub open, with where to connect it', async () => {
  await page.goto('/');

  await expect(Card.region()).toContainText('0 of 1 done');
  await expect(Card.region()).toContainText(
    'This list disappears once everything is done.',
  );
  await expect(
    Card.row('Connect GitHub').getByRole('link', { name: 'Connect GitHub' }),
  ).toHaveAttribute('href', '/setup/github');
  await expect(Card.region().getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText('Nothing here yet')).toHaveCount(0);
});

test('the card fits a phone without scrolling sideways', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(Card.region()).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('connecting GitHub takes the card away', async () => {
  await Progress.connectGitHub();
  await page.goto('/');

  await expect(Card.region()).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'GitHub', exact: true }),
  ).toBeVisible();
});

test('a signed-out visitor sees no card', async () => {
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(Card.region()).toHaveCount(0);
});
