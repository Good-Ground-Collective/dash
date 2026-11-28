import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';

/** Since yesterday and the groups in it. */
class Since {
  static region(): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name: 'Since yesterday', exact: true });
  }

  /** The button that expands a group: the one whose text begins with its title. */
  static toggle(title: string): ReturnType<Page['getByRole']> {
    return Since.region().getByRole('button', {
      name: new RegExp(`^${title}`, 'u'),
    });
  }

  static group(id: string): ReturnType<Page['locator']> {
    return Since.region().locator(`[data-group="${id}"]`);
  }

  /** Each group's header text, in order, with its whitespace collapsed. */
  static async headers(): Promise<(string | undefined)[]> {
    return Since.region()
      .locator('[data-group]')
      .evaluateAll((items) =>
        items.map((item) =>
          item
            .querySelector('button')
            ?.textContent?.replace(/\s+/gu, ' ')
            .trim(),
        ),
      );
  }

  static async open(path = '/'): Promise<void> {
    await page.goto(path);
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  }

  static async overflow(): Promise<number> {
    return page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
  }
}

class Feed {
  static async scenario(name: string): Promise<void> {
    await page.request.post(
      `${missionControl}/integrations/github/__stub/feed?name=${name}`,
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
  await page.request.post(
    `${missionControl}/integrations/github/__stub/scenario?name=linked`,
  );
  await page.request.post(
    `${missionControl}/objectives/__stub/scenario?name=populated`,
  );
  await Feed.scenario('busy-day');
});

test('a busy day shows six collapsed items, closed work first and the smallest epics folded together', async () => {
  await Since.open();

  await expect(Since.region().locator('[data-group]')).toHaveCount(6);
  await expect(Since.region().getByRole('button')).toHaveCount(6);
  for (const toggle of await Since.region().getByRole('button').all()) {
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(Since.region().getByRole('link')).toHaveCount(0);

  const headers = await Since.headers();
  expect(headers[0]).toContain('Private beta');
  expect(headers[0]).toContain('4 merged · 4 closed');
  expect(headers[1]).toContain('Sign-in with passkeys');
  expect(headers[1]).toContain('11 merged · 3 closed');
  expect(headers[1]).toContain('4 of 6 done');
  expect(headers[2]).toContain('Billing page');
  expect(headers[2]).toContain('8 merged · 4 closed');
  expect(headers[3]).toContain('4 more epics');
  expect(headers[3]).toContain('16 merged');
  expect(headers[4]).toContain('Releases');
  expect(headers[4]).toContain('4 releases');
  expect(headers[5]).toContain('Other merges');
  expect(headers[5]).toContain('6 merged');
});

test('a group expands to its pull requests and collapses again', async () => {
  await Since.open();

  const passkeys = Since.toggle('Sign-in with passkeys');
  await passkeys.click();
  await expect(passkeys).toHaveAttribute('aria-expanded', 'true');
  const group = Since.group('epic:E_passkeys');
  await expect(
    group.getByRole('link', { name: /Tighten sign-in 1/u }),
  ).toHaveAttribute('href', 'https://github.com/acme-labs/api/pull/500');
  await expect(group.getByRole('listitem')).toHaveCount(11);
  await expect(
    group.getByRole('link', { name: /^Open on GitHub/u }),
  ).toHaveAttribute('href', 'https://github.com/acme-labs/api/issues/10');
  await expect(Since.toggle('Billing page')).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await passkeys.click();
  await expect(passkeys).toHaveAttribute('aria-expanded', 'false');
  await expect(group.getByRole('listitem')).toHaveCount(0);
});

test('a closed initiative lists the epic that closed it, and Releases lists each release', async () => {
  await Since.open();

  await Since.toggle('Private beta').click();
  await expect(Since.group('initiative:PVT_beta')).toContainText('Invite flow');
  await Since.toggle('Releases').click();
  await expect(
    Since.group('releases').getByRole('link', { name: /API 2\.6\.1/u }),
  ).toHaveAttribute(
    'href',
    'https://github.com/acme-labs/api/releases/tag/v2.6.1',
  );
  await expect(Since.group('releases').getByRole('listitem')).toHaveCount(4);
  await expect(Since.region()).not.toContainText('Web 1.10.1');
});

test('the keyboard opens and closes a group', async () => {
  await Since.open();

  const releases = Since.toggle('Releases');
  await releases.focus();
  await page.keyboard.press('Enter');
  await expect(releases).toHaveAttribute('aria-expanded', 'true');
  await expect(
    Since.region().getByRole('link', { name: /API 2\.6\.1/u }),
  ).toBeVisible();
  await page.keyboard.press('Space');
  await expect(releases).toHaveAttribute('aria-expanded', 'false');
});

test('the folded item lists each epic it holds under its own heading', async () => {
  await Since.open();

  await Since.toggle('4 more epics').click();
  const group = Since.group('more-epics');
  for (const title of [
    'Status page',
    'Rewrite the guides',
    'Refresh API reference',
    'Publish the changelog',
  ]) {
    await expect(group).toContainText(title);
  }
  await expect(group.getByRole('listitem')).toHaveCount(16);
});

test('what a person expanded is still expanded after a reload, and a store that refuses writes changes nothing', async () => {
  await Since.open();

  await Since.toggle('Other merges').click();
  await page.reload();
  await expect(Since.toggle('Other merges')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(Since.toggle('Releases')).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(
      key: string,
      value: string,
    ): void {
      if (key.startsWith('dash:')) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      original.call(this, key, value);
    };
  });
  await Since.toggle('Other merges').click();
  await expect(Since.toggle('Other merges')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('on a phone the grouped list fits without scrolling sideways and its headers are 44 px targets', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await Since.open();

  for (const toggle of await Since.region().getByRole('button').all()) {
    const box = await toggle.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  }

  await Since.toggle('Sign-in with passkeys').click();
  await Since.toggle('4 more epics').click();
  for (const link of await Since.region().getByRole('link').all()) {
    const box = await link.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  }
  expect(await Since.overflow()).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('a quiet day keeps the empty state', async () => {
  await Feed.scenario('empty');
  await page.goto('/');

  await expect(Since.region()).toContainText(
    'Nothing merged or released in the last 24 hours',
  );
  await expect(Since.region().getByRole('button')).toHaveCount(0);
});
