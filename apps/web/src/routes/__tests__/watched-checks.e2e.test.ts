import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';

/** Finds the pieces of Settings → Watched checks and drives the stub's feed. */
class Section {
  static async open(scenario = 'populated'): Promise<void> {
    await page.request.post(`${missionControl}/api/auth/__stub/reset`);
    await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
    await page.request.post(
      `${missionControl}/integrations/github/__stub/feed?name=${scenario}`,
    );
    await page.goto('/settings/watched-checks');
  }

  static rules() {
    return page.getByRole('region', { name: 'Rules for every repo' });
  }

  static repos() {
    return page.getByRole('region', { name: 'Repos', exact: true });
  }

  static row(repository: string) {
    return Section.repos().getByRole('row', {
      name: new RegExp(repository, 'u'),
    });
  }

  static dialog() {
    return page.getByRole('dialog');
  }

  static choice(props: {
    check: string;
    answer: 'Rules' | 'Watch' | 'Ignore';
  }) {
    return Section.dialog()
      .getByRole('group', { name: `Watching ${props.check}` })
      .getByRole('radio', { name: props.answer });
  }

  static async edit(repository: string): Promise<void> {
    await Section.row(repository)
      .getByRole('button', { name: `Edit ${repository}` })
      .click();
    await expect(Section.dialog()).toBeVisible();
  }

  static async overflow(): Promise<number> {
    return page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
  }
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
  const context = await browser.newContext({ baseURL: baseURL ?? '' });
  page = await context.newPage();
});

test.beforeEach(async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await Section.open();
});

test('the sidebar marks Watched checks current and the page lists the rules and repos', async () => {
  await expect(
    page.getByRole('link', { name: 'Watched checks' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(Section.rules()).toContainText('Deploy*');
  await expect(Section.rules()).toContainText('matches in 3 repos');
  await expect(Section.repos()).toContainText('3 of 3 · across 2 accounts');
  await expect(Section.row('acme-labs/web')).toContainText('custom');
  await expect(Section.row('acme-labs/web')).toContainText('Failing');
  await expect(Section.row('night-shift/ops')).toContainText('Pending');
});

test('adding a rule watches the checks it matches, and removing it stops', async () => {
  await page.getByLabel('Check name or prefix').fill('Lighthouse*');
  await page.getByRole('button', { name: 'Add rule' }).click();

  const added = Section.rules().getByRole('listitem').filter({
    hasText: 'Lighthouse*',
  });
  await expect(added).toContainText('Check name starts with “Lighthouse”');
  await expect(added).toContainText('matches in 1 repo');
  await expect(Section.row('acme-labs/web')).toContainText('Lighthouse CI');

  await added.getByRole('button', { name: 'Remove rule Lighthouse*' }).click();
  await expect(Section.rules()).not.toContainText('Lighthouse*');
  await expect(Section.row('acme-labs/web')).not.toContainText('Lighthouse CI');
});

test('a rule that is not a name or a prefix is refused with the reason', async () => {
  await page.getByLabel('Check name or prefix').fill('a*b');
  await page.getByRole('button', { name: 'Add rule' }).click();

  await expect(Section.rules().getByRole('alert')).toContainText(
    'Use a check name, or a prefix ending in one *',
  );
  await expect(Section.rules()).not.toContainText('a*b');
});

test('overriding a check ignores it for that repo only and marks the repo custom', async () => {
  await expect(Section.row('acme-labs/api')).toContainText('Passing');

  await Section.edit('acme-labs/api');
  await Section.choice({
    check: 'Deploy to Staging',
    answer: 'Ignore',
  }).check();
  await Section.dialog().getByRole('button', { name: 'Save' }).click();

  await expect(Section.dialog()).toBeHidden();
  await expect(Section.row('acme-labs/api')).toContainText('Nothing watched');
  await expect(Section.row('acme-labs/api')).toContainText('custom');
  await expect(Section.row('night-shift/ops')).not.toContainText('custom');
  await expect(Section.row('night-shift/ops')).toContainText('Pending');

  await Section.edit('acme-labs/api');
  await expect(
    Section.choice({ check: 'Deploy to Staging', answer: 'Ignore' }),
  ).toBeChecked();
  await Section.choice({ check: 'Deploy to Staging', answer: 'Rules' }).check();
  await Section.dialog().getByRole('button', { name: 'Save' }).click();
  await expect(Section.row('acme-labs/api')).toContainText('Passing');
  await expect(Section.row('acme-labs/api')).not.toContainText('custom');
});

test('watching a check the rules skip turns the repo red, and cancel discards a change', async () => {
  await Section.edit('acme-labs/api');
  await Section.choice({ check: 'build', answer: 'Watch' }).check();
  await Section.dialog().getByRole('button', { name: 'Cancel' }).click();
  await expect(Section.dialog()).toBeHidden();
  await expect(Section.row('acme-labs/api')).not.toContainText('custom');

  await Section.edit('acme-labs/api');
  await expect(
    Section.choice({ check: 'build', answer: 'Rules' }),
  ).toBeChecked();
  await Section.choice({ check: 'build', answer: 'Watch' }).check();
  await Section.dialog().getByRole('button', { name: 'Save' }).click();
  await expect(Section.row('acme-labs/api')).toContainText('custom');
  await expect(Section.row('acme-labs/api')).toContainText(
    'build, Deploy to Staging',
  );
});

test('the edit modal is centred, scrolls inside itself when short of room and keeps focus', async () => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await Section.edit('acme-labs/web');

  const box = await Section.dialog().boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box === null || viewport === null) return;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(
    2,
  );
  expect(box.height).toBeLessThanOrEqual(viewport.height);

  const scrolls = await Section.dialog()
    .locator('.checks')
    .evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(scrolls).toBe(true);

  for (let press = 0; press < 20; press += 1) {
    await page.keyboard.press('Tab');
  }
  const focusInside = await Section.dialog().evaluate((element) =>
    element.contains(document.activeElement),
  );
  expect(focusInside).toBe(true);

  await page.keyboard.press('Escape');
  await expect(Section.dialog()).toBeHidden();
});

test('over a hundred repos, search and the filters narrow the table without breaking the layout', async () => {
  await Section.open('many-repos');

  await expect(Section.repos()).toContainText('113 of 113 · across 6 accounts');
  expect(await Section.overflow()).toBeLessThanOrEqual(0);

  await page.getByLabel('Search repos').fill('repo-07');
  await expect(Section.repos()).toContainText('10 of 113');
  await expect(Section.repos().getByRole('row')).toHaveCount(11);

  await page.getByLabel('Search repos').fill('');
  await Section.repos()
    .getByRole('button', { name: /^Nothing watched/u })
    .click();
  await expect(Section.repos()).toContainText('0 of 113');
  await expect(Section.repos()).toContainText('No repos match.');

  await Section.repos()
    .getByRole('button', { name: /^Failing/u })
    .click();
  await expect(Section.repos()).toContainText('of 113');
  await expect(Section.row('acme-labs/web')).toBeVisible();
});

test('at 390 px the rules and repos reflow, and the modal fills the screen with 44 px choices', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await Section.open('many-repos');

  expect(await Section.overflow()).toBeLessThanOrEqual(0);
  const search = await page.getByLabel('Search repos').boundingBox();
  expect(search?.width ?? 0).toBeGreaterThan(300);
  await expect(page.locator('thead')).not.toBeInViewport();

  await page.getByLabel('Search repos').fill('acme-labs/web');
  await Section.edit('acme-labs/web');
  const box = await Section.dialog().boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });

  for (const answer of ['Rules', 'Watch', 'Ignore'] as const) {
    const target = await Section.choice({
      check: 'build',
      answer,
    }).boundingBox();
    expect(target?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(target?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(await Section.overflow()).toBeLessThanOrEqual(0);
});
