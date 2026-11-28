import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';

/** Drives the stub's GitHub state and finds the feed on the page. */
class Feed {
  static async scenario(name: string): Promise<void> {
    await page.request.post(
      `${missionControl}/integrations/github/__stub/feed?name=${name}`,
    );
  }

  static needsYou(): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name: 'Needs you', exact: true });
  }

  static group(name: string): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name, exact: true });
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
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
});

test.beforeEach(async () => {
  await Feed.scenario('populated');
});

test('before any connection, home and the GitHub page point to Connect GitHub', async () => {
  await Feed.scenario('not-connected');

  for (const path of ['/', '/github']) {
    await page.goto(path);
    await expect(page.getByText('GitHub isn’t connected yet')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Connect GitHub' }).last(),
    ).toHaveAttribute('href', '/setup/github');
  }

  await page.goto('/');
  const since = page.getByRole('region', { name: 'Since yesterday' });
  await expect(since).toContainText('No GitHub activity to show');
  await expect(since).not.toContainText('Nothing merged');
  await expect(since.getByRole('link')).toHaveCount(0);
});

test('while the first read runs, both say so', async () => {
  await Feed.scenario('first-sync');

  await page.goto('/');
  await expect(Feed.needsYou()).toContainText(
    'Reading GitHub for the first time',
  );
  await page.goto('/github');
  await expect(page.getByRole('status')).toContainText(
    'Reading GitHub for the first time',
  );
  await expect(page.getByText('First sync in progress')).toBeVisible();
});

test('a connected account with nothing to do shows each group’s empty state', async () => {
  await Feed.scenario('empty');
  await page.goto('/github');

  await expect(Feed.group('Review requests')).toContainText(
    'Nothing is waiting on your review.',
  );
  await expect(Feed.group('My pull requests')).toContainText(
    'You have no open pull requests.',
  );
  await expect(Feed.group('Failed runs')).toContainText(
    'No failed runs on your branches or default branches.',
  );
  await expect(Feed.group('Assigned issues')).toContainText(
    'No open issues are assigned to you.',
  );
});

test('home lists what needs you and what merged since yesterday, each opening GitHub', async () => {
  await Feed.scenario('populated');
  await page.goto('/');

  const needsYou = Feed.needsYou();
  const review = needsYou.getByRole('link', {
    name: /Rate-limit the public search/u,
  });
  await expect(review).toHaveAttribute(
    'href',
    'https://github.com/acme-labs/api/pull/412',
  );
  await expect(review).toHaveAttribute('target', '_blank');
  await expect(review).toContainText('Review');
  const failing = needsYou.getByRole('link', {
    name: /Show sync freshness on the dashboard/u,
  });
  await expect(failing).toContainText('2 checks failing');
  await expect(needsYou).not.toContainText('Retry webhooks with backoff');
  await expect(needsYou).not.toContainText('Cache the objectives read');

  const since = page.getByRole('region', { name: 'Since yesterday' });
  await expect(since.getByRole('listitem')).toHaveCount(2);
  await expect(
    since.getByRole('link', { name: /Cache the objectives read/u }),
  ).toHaveAttribute('href', 'https://github.com/acme-labs/api/pull/409');
  await expect(since).toContainText('Merged');
  await expect(
    since.getByRole('link', { name: /API 2\.4\.0/u }),
  ).toHaveAttribute(
    'href',
    'https://github.com/acme-labs/api/releases/tag/v2.4.0',
  );
  await expect(since).toContainText('Shipped');
  await expect(since).not.toContainText('Retire the old settings tabs');
  await expect(since).not.toContainText('Web 1.9.0');
});

test('Needs you says so when nothing waits on you', async () => {
  await Feed.scenario('empty');
  await page.goto('/');

  await expect(Feed.needsYou()).toContainText('Nothing needs you');
  await expect(
    page.getByRole('region', { name: 'Since yesterday' }),
  ).toContainText('Nothing merged or released in the last 24 hours');
});

test('the GitHub page lists every row with freshness and the last error', async () => {
  await page.goto('/github');

  await expect(Feed.group('Review requests').getByRole('listitem')).toHaveCount(
    4,
  );
  const freshness = page.getByRole('list', { name: 'Connection freshness' });
  await expect(freshness).toContainText('Synced 4 minutes ago');
  await expect(freshness).toContainText('Synced 3 hours ago');
  const warning = page
    .getByRole('status')
    .filter({ hasText: 'Dash couldn’t read night-shift' });
  await expect(warning).toContainText('rate-limited');
});

test('a connection whose last read hit a cap says only recent items show', async () => {
  await Feed.scenario('truncated');
  await page.goto('/github');

  const freshness = page.getByRole('list', { name: 'Connection freshness' });
  await expect(freshness).toContainText(
    'Showing the most recent items for acme-labs',
  );
  await expect(freshness).not.toContainText(
    'Showing the most recent items for night-shift',
  );

  await Feed.scenario('populated');
  await page.goto('/github');
  await expect(freshness).not.toContainText('Showing the most recent items');
});

test('the account filter narrows the groups and survives a reload', async () => {
  await page.goto('/github');
  const filter = page.getByRole('navigation', { name: 'Filter by account' });
  await filter.getByRole('link', { name: 'night-shift' }).click();

  await expect(page).toHaveURL('/github?account=night-shift');
  await expect(Feed.group('Review requests').getByRole('listitem')).toHaveCount(
    1,
  );
  await page.reload();
  await expect(
    filter.getByRole('link', { name: 'night-shift' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(Feed.group('Assigned issues')).toContainText(
    'Document the on-call handover',
  );
  await expect(Feed.group('Assigned issues')).not.toContainText('Dark mode');

  await filter.getByRole('link', { name: 'All accounts' }).click();
  await expect(page).toHaveURL('/github');
  await expect(Feed.group('Review requests').getByRole('listitem')).toHaveCount(
    4,
  );
});

test('an unknown account shows everything and says so', async () => {
  await page.goto('/github?account=nobody');

  await expect(
    page.getByText('No connection is called “nobody”'),
  ).toBeVisible();
  await expect(Feed.group('Review requests').getByRole('listitem')).toHaveCount(
    4,
  );
});

test('the feed fits a phone without scrolling sideways', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/github', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await Feed.overflow()).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('the last rows scroll clear of the Needs you pill', async () => {
  const pill = page.getByRole('button', { name: /^Needs you/u });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/github']) {
      await page.goto(path);
      const last = page.getByRole('main').getByRole('listitem').last();
      const pillTop = (await pill.boundingBox())?.y ?? 0;
      await expect
        .poll(() =>
          last.evaluate((row) => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            return row.getBoundingClientRect().bottom;
          }),
        )
        .toBeLessThan(pillTop);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('Settings › Connections lists owned installs with where to manage them', async () => {
  await page.request.post(
    `${missionControl}/integrations/github/__stub/scenario?name=linked`,
  );
  await page.goto('/settings');

  const connections = page.getByRole('region', { name: 'Connections' });
  const installs = connections.getByRole('list', { name: 'GitHub installs' });
  await expect(installs.getByRole('listitem')).toHaveCount(3);
  await expect(installs).toContainText('Synced 4 minutes ago');
  await expect(
    installs.getByRole('listitem').filter({ hasText: 'ada' }),
  ).toContainText('Initiatives come from organisation Projects.');
  await expect(
    installs.getByRole('listitem').filter({ hasText: 'acme-labs' }),
  ).not.toContainText('Initiatives come from');
  await expect(installs).toContainText('rate-limited');
  await expect(
    connections.getByRole('link', { name: 'Manage on GitHub acme-labs' }),
  ).toHaveAttribute(
    'href',
    /^https:\/\/github\.com\/settings\/installations\/\d+$/u,
  );
  await expect(
    connections.getByRole('link', { name: 'Add another account' }),
  ).toHaveAttribute('href', /\/integrations\/github\/__stub\/pick/u);
  await expect(connections).toContainText('personal access token');
});

test('when the feed fails, home still renders with an inline error', async () => {
  await Feed.scenario('failing');

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(
    Feed.needsYou()
      .getByRole('status')
      .filter({ hasText: 'GitHub activity didn’t load' }),
  ).toBeVisible();
  const since = page.getByRole('region', { name: 'Since yesterday' });
  await expect(since).toContainText('No GitHub activity to show');
  await expect(since).not.toContainText('Nothing merged');
  await expect(since).not.toContainText('GitHub activity didn’t load');
  await page.goto('/github');
  await expect(
    page.getByRole('status').filter({ hasText: 'GitHub activity didn’t load' }),
  ).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('region', { name: 'Connections' })).toContainText(
    'didn’t list your connections',
  );
});

test('a signed-out visitor is sent to sign in from the GitHub page', async () => {
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
  await page.goto('/github');

  await expect(page).toHaveURL('/sign-in');
});
