import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { BriefingDriver } from './support/live/briefings/briefing-driver.ts';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });
const phone = { width: 390, height: 844 } as const;
const touchTarget = 44;

test.describe.configure({ mode: 'serial' });

let page: Page;
let briefing: BriefingDriver;

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  const { missionControlUrl } = projectSettingsSchema.parse(
    testInfo.project.metadata,
  );
  const context = await browser.newContext({
    baseURL: baseURL ?? '',
    viewport: phone,
  });
  page = await context.newPage();
  briefing = new BriefingDriver({ page, missionControl: missionControlUrl });
  await page.request.post(`${missionControlUrl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControlUrl}/api/auth/__stub/sign-in`);
  await briefing.scenario('ready');
});

test('the briefing card shows its opening, bulleted actions and closing', async () => {
  await page.goto('/');

  const region = briefing.region();
  await expect(region.getByRole('listitem')).toHaveCount(2);
  await expect(region).toContainText('Two things need you today');
  await expect(region).toContainText('too thin to call');
  await expect(
    region.getByRole('list', { name: 'Actions' }).getByRole('link', {
      name: 'Add passkey sign-in',
    }),
  ).toHaveAttribute('href', 'https://github.com/acme-labs/api/pull/42');
});

test('on a phone the card has no sideways scroll and a full-size Regenerate', async () => {
  await page.goto('/');
  await expect(briefing.region()).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  const button = await briefing.regenerate().boundingBox();
  const card = await briefing.region().boundingBox();
  if (button === null || card === null) {
    throw new Error('The regenerate button and the card must both be laid out');
  }
  expect(overflow).toBeLessThanOrEqual(0);
  expect(button.height).toBeGreaterThanOrEqual(touchTarget);
  expect(card.x + card.width).toBeLessThanOrEqual(phone.width);
});

test('the generated and data-age line sits under the title on a phone', async () => {
  await page.goto('/');

  const title = await briefing
    .region()
    .getByRole('heading', { name: 'Briefing' })
    .boundingBox();
  const generated = await briefing
    .region()
    .getByText(/^Generated /u)
    .boundingBox();
  if (title === null || generated === null) {
    throw new Error('The title and the generated line must both be laid out');
  }
  expect(generated.y).toBeGreaterThan(title.y + title.height - 1);
});
