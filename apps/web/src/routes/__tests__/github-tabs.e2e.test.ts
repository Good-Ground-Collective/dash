import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;

/** The GitHub page's regions, by heading. */
class Feed {
  static group(name: string): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name, exact: true });
  }
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  const missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
  const context = await browser.newContext({ baseURL: baseURL ?? '' });
  page = await context.newPage();
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
  await page.request.post(
    `${missionControl}/integrations/github/__stub/feed?name=populated`,
  );
});

test('the tabs are links with counts, and the active one survives a reload', async () => {
  await page.goto('/github');
  const tabs = page.getByRole('navigation', { name: 'GitHub views' });
  await expect(
    tabs.getByRole('link', { name: /^Review requests/u }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    tabs.getByRole('link', { name: /^Review requests/u }),
  ).toContainText('4');
  await expect(tabs.getByRole('link', { name: /^My PRs/u })).toContainText('3');
  await expect(tabs.getByRole('link', { name: /^Assigned/u })).toContainText(
    '2',
  );

  await tabs.getByRole('link', { name: /^My PRs/u }).click();
  await expect(page).toHaveURL('/github?tab=mine');
  await page.reload();
  await expect(tabs.getByRole('link', { name: /^My PRs/u })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('My PRs groups pull requests by what they need and hides empty groups', async () => {
  await page.goto('/github?tab=mine');

  await expect(
    Feed.group('Changes requested').getByRole('link', {
      name: /Show sync freshness on the dashboard/u,
    }),
  ).toHaveAttribute('href', 'https://github.com/acme-labs/web/pull/90');
  await expect(Feed.group('Ready to merge')).toContainText(
    'Retry webhooks with backoff',
  );
  await expect(Feed.group('Waiting on review')).toContainText(
    'Pin the runner image',
  );
  await expect(
    page.getByRole('region', { name: 'Checks failing', exact: true }),
  ).toHaveCount(0);
});

test('Assigned lists assigned issues, each opening GitHub in a new tab', async () => {
  await page.goto('/github?tab=assigned');

  const issue = Feed.group('Assigned issues').getByRole('link', {
    name: /Dark mode flickers on first load/u,
  });
  await expect(issue).toHaveAttribute('target', '_blank');
  await expect(Feed.group('Assigned issues').getByRole('listitem')).toHaveCount(
    2,
  );
});

test('the account filter and the tab combine, each surviving the other', async () => {
  await page.goto('/github?tab=assigned');
  const filter = page.getByRole('navigation', { name: 'Filter by account' });
  await filter.getByRole('link', { name: 'night-shift' }).click();

  await expect(page).toHaveURL('/github?account=night-shift&tab=assigned');
  await expect(Feed.group('Assigned issues').getByRole('listitem')).toHaveCount(
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

  const tabs = page.getByRole('navigation', { name: 'GitHub views' });
  await tabs.getByRole('link', { name: /^Review requests/u }).click();
  await expect(page).toHaveURL('/github?account=night-shift&tab=review');
  await expect(Feed.group('Review requests').getByRole('listitem')).toHaveCount(
    1,
  );

  await filter.getByRole('link', { name: 'All accounts' }).click();
  await expect(page).toHaveURL('/github?tab=review');
  await expect(Feed.group('Review requests').getByRole('listitem')).toHaveCount(
    4,
  );
});

test('an unknown account shows everything and says so', async () => {
  await page.goto('/github?account=nobody&tab=mine');

  await expect(
    page.getByText('No connection is called “nobody”'),
  ).toBeVisible();
  await expect(Feed.group('Ready to merge').getByRole('listitem')).toHaveCount(
    1,
  );
  await page.getByRole('link', { name: 'Clear the filter' }).click();
  await expect(page).toHaveURL('/github?tab=mine');
});
