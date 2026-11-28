import { expect, type Locator, type Page, test } from '@playwright/test';
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

  await expect(page).toHaveURL('/settings/profile');
});

const settingsSections = [
  { href: '/settings/profile', label: 'Profile and time zone' },
  { href: '/settings/appearance', label: 'Appearance' },
  { href: '/settings/passkeys', label: 'Passkeys' },
  { href: '/settings/recovery-codes', label: 'Recovery codes' },
  { href: '/settings/github', label: 'Connections' },
  { href: '/settings/watched-checks', label: 'Watched checks' },
  { href: '/settings/service-accounts', label: 'Service accounts' },
  { href: '/settings/briefings', label: 'Spend' },
] as const;

test('the settings sidebar groups the sections and marks the current one', async () => {
  await page.goto('/settings');
  await expect(page).toHaveURL('/settings/profile');
  const sidebar = page.getByRole('navigation', { name: 'Settings sections' });
  for (const group of ['Account', 'GitHub', 'Agents', 'Briefings']) {
    await expect(sidebar.getByText(group, { exact: true })).toBeVisible();
  }

  for (const section of settingsSections) {
    await page.goto(section.href);
    await expect(
      sidebar.getByRole('link', { name: section.label, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.locator('[aria-current="page"]')).toHaveCount(1);
  }
});

test('the account menu marks its most specific entry current on every settings page', async () => {
  for (const section of settingsSections) {
    await page.goto(section.href);
    await page
      .getByRole('button', { name: 'Account, signed in as Ada Lovelace' })
      .click();
    const onServiceAccounts = section.href === '/settings/service-accounts';
    const current = onServiceAccounts ? 'Service accounts' : 'Settings';
    const other = onServiceAccounts ? 'Settings' : 'Service accounts';
    await expect(
      page.getByRole('menuitem', { name: current, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      page.getByRole('menuitem', { name: other, exact: true }),
    ).not.toHaveAttribute('aria-current');
    await page.keyboard.press('Escape');
  }
});

const phone = { width: 390, height: 844 } as const;
const desktop = { width: 1280, height: 720 } as const;

/** Layout checks for the phone-width viewport. */
class PhoneLayout {
  static async scrollsSideways(): Promise<boolean> {
    return page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
  }

  /**
   * Whether something else paints over the middle of the element, or it sits
   * outside the viewport. An open menu turns off pointer events on the body,
   * which hit testing honours, so they are switched back on for the probe.
   */
  static async isCovered(locator: Locator): Promise<boolean> {
    return locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const inView =
        box.top >= 0 &&
        box.left >= 0 &&
        box.right <= window.innerWidth &&
        box.bottom <= window.innerHeight;
      const bodyPointerEvents = document.body.style.pointerEvents;
      document.body.style.pointerEvents = 'auto';
      const topmost = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      document.body.style.pointerEvents = bodyPointerEvents;
      return !inView || topmost === null || !element.contains(topmost);
    });
  }
}

test('main pages fit a phone without scrolling sideways', async () => {
  await page.setViewportSize(phone);
  const paths = ['/', ...settingsSections.map((section) => section.href)];
  for (const path of paths) {
    await page.goto(path);
    expect(await PhoneLayout.scrollsSideways(), path).toBe(false);
  }
});

test('on a phone the settings sidebar stacks above the section', async () => {
  await page.setViewportSize(phone);
  await page.goto('/settings/passkeys');

  const sidebar = await page
    .getByRole('navigation', { name: 'Settings sections' })
    .boundingBox();
  const heading = await page
    .getByRole('heading', { name: 'Passkeys', level: 1 })
    .boundingBox();

  expect(sidebar).not.toBeNull();
  expect(heading).not.toBeNull();
  expect((sidebar?.y ?? 0) + (sidebar?.height ?? 0)).toBeLessThanOrEqual(
    heading?.y ?? 0,
  );
});

test('on a phone every settings sidebar link is a 44px tap target', async () => {
  await page.setViewportSize(phone);
  await page.goto('/settings/passkeys');

  const links = page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link');
  expect(await links.count()).toBe(settingsSections.length);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box, await link.innerText()).not.toBeNull();
    expect(box?.height ?? 0, await link.innerText()).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, await link.innerText()).toBeGreaterThanOrEqual(120);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(phone.width);
  }
});

test('on a phone the open account menu sits above the top bar', async () => {
  await page.setViewportSize(phone);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Account, signed in as Ada Lovelace' })
    .click();
  const heading = page.getByRole('menu').getByText('Ada Lovelace');
  await expect(heading).toBeVisible();

  await expect.poll(async () => PhoneLayout.isCovered(heading)).toBe(false);

  const monoLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (face) =>
        face.family === 'Geist Mono Variable' && face.status === 'loaded',
    );
  });
  expect(monoLoaded).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await page.setViewportSize(desktop);
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

test('sign-in and recovery fit a phone without scrolling sideways', async () => {
  await page.setViewportSize(phone);
  for (const path of ['/sign-in', '/recover', '/recover/passkey']) {
    await page.goto(path);
    expect(await PhoneLayout.scrollsSideways(), path).toBe(false);
  }
});
