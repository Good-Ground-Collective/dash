import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';
let saved: string[] = [];

/** The codes step as the person sees it. */
class CodesStep {
  static list(): ReturnType<Page['getByRole']> {
    return page.getByRole('list', { name: 'Recovery codes' });
  }

  static async codes(): Promise<string[]> {
    await expect(CodesStep.list().getByRole('listitem')).toHaveCount(10);
    return CodesStep.list().getByRole('listitem').allInnerTexts();
  }

  static savedBox(): ReturnType<Page['getByLabel']> {
    return page.getByLabel('I’ve saved these codes somewhere safe');
  }

  static async redeem(code: string): Promise<number> {
    const answer = await page.request.post(
      `${missionControl}/api/auth/recovery/redeem`,
      { data: { email: 'ada@example.com', code } },
    );
    return answer.status();
  }
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
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
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
});

test('setup goes from the passkey to the codes step, which needs the box ticked', async () => {
  await page.goto('/setup');
  await page.getByLabel('Setup token').fill('stub-setup-token');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Display name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByRole('button', { name: 'Register passkey' }).click();

  await expect(page).toHaveURL('/setup/recovery-codes?onboarding');
  const title = page.getByRole('heading', { name: 'Save your recovery codes' });
  await expect(title).toBeFocused();
  await expect(title).toHaveAccessibleDescription('Step 3 of 4');
  saved = await CodesStep.codes();
  expect(new Set(saved).size).toBe(10);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await CodesStep.savedBox().check();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});

test('every other page sends you back, and a reload shows a new set', async () => {
  await page.goto('/settings');

  await expect(page).toHaveURL('/setup/recovery-codes');
  const afterRedirect = await CodesStep.codes();
  expect(afterRedirect).not.toEqual(saved);
  await expect(CodesStep.savedBox()).not.toBeChecked();

  await page.reload();
  saved = await CodesStep.codes();
  expect(saved).not.toEqual(afterRedirect);
  expect(saved.some((code) => page.url().includes(code))).toBe(false);
});

test('Copy and Download hand over every code', async () => {
  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Codes copied.' }),
  ).toBeAttached();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n')).toEqual(expect.arrayContaining(saved));

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download .txt' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('dash-recovery-codes.txt');
  const file = await readFile(await download.path(), 'utf8');
  expect(file).toBe(copied);
});

test('the step fits a phone without scrolling sideways', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('confirming after the gate sent you back skips to Connect GitHub, and the saved codes work', async () => {
  await CodesStep.savedBox().check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL('/setup/github');
  await expect(
    page.getByRole('heading', { name: 'Connect GitHub' }),
  ).toBeFocused();
  await page.getByRole('link', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('button', { name: 'Account, signed in as Ada Lovelace' }),
  ).toBeVisible();
  expect(await CodesStep.redeem(saved[0] ?? '')).toBe(200);
  await page.goto('/setup/recovery-codes');
  await expect(page).toHaveURL('/');
});

test('settings regenerates after a passkey check, and the old codes stop working', async () => {
  await page.goto('/settings');
  const panel = page.getByRole('region', { name: 'Recovery codes' });
  await expect(panel.getByText('10 of 10 codes left')).toBeVisible();
  await page.request.post(`${missionControl}/api/auth/__stub/age-session`);

  await panel.getByRole('button', { name: 'Regenerate codes' }).click();
  await panel.getByRole('button', { name: 'Confirm with a passkey' }).click();

  await expect(panel.getByText(/Save these new codes/u)).toBeFocused();
  const fresh = await CodesStep.codes();
  const use = panel.getByRole('button', { name: 'Use these codes' });
  await expect(use).toBeDisabled();
  await CodesStep.savedBox().check();
  await use.click();

  await expect(
    page.getByRole('status').filter({ hasText: /New codes saved/u }),
  ).toBeAttached();
  await expect(
    panel.getByRole('button', { name: 'Regenerate codes' }),
  ).toBeFocused();
  await expect(CodesStep.list()).toHaveCount(0);
  expect(await CodesStep.redeem(saved[1] ?? '')).toBe(401);
  expect(await CodesStep.redeem(fresh[0] ?? '')).toBe(200);
});

test('cancelling a new set keeps the current codes', async () => {
  await page.getByRole('button', { name: 'Regenerate codes' }).click();
  await expect(CodesStep.list()).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(CodesStep.list()).toHaveCount(0);
  await expect(page.getByText('10 of 10 codes left')).toBeVisible();
});

test('settings nudges when two or fewer codes are left', async () => {
  await page.request.post(`${missionControl}/api/auth/__stub/recovery-codes`, {
    data: { codes: ['k7m2-q9xp', 'w4hr-t8nc'] },
  });
  await page.goto('/settings');

  const panel = page.getByRole('region', { name: 'Recovery codes' });
  await expect(panel.getByText('2 of 10 codes left')).toBeVisible();
  await expect(panel.getByText(/You’re running low/u)).toBeVisible();
});
