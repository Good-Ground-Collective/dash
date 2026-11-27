import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';

/** The Connect GitHub step as the person sees it. */
class ConnectStep {
  static accounts(): ReturnType<Page['getByRole']> {
    return page.getByRole('region', { name: 'GitHub accounts' });
  }

  static row(login: string): ReturnType<Page['getByRole']> {
    return ConnectStep.accounts()
      .getByRole('listitem')
      .filter({ hasText: login });
  }

  static async scenario(
    scenario: 'authorize' | 'linked' | 'failing',
  ): Promise<void> {
    await page.request.post(
      `${missionControl}/integrations/github/__stub/scenario?name=${scenario}`,
    );
  }
}

test.beforeAll(async ({ browser, baseURL }, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
  page = await browser.newPage({ baseURL: baseURL ?? '' });
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
});

test('a signed-out visitor is sent to sign in', async () => {
  await page.goto('/setup/github');
  await expect(page).toHaveURL('/sign-in');
  await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
});

test('before GitHub is linked, the step offers to connect it', async () => {
  await page.goto('/setup/github');

  const title = page.getByRole('heading', { name: 'Connect GitHub' });
  await expect(title).toBeFocused();
  await expect(title).toHaveAccessibleDescription('Connect · optional');
  const connect = ConnectStep.accounts().getByRole('link', {
    name: 'Connect GitHub',
  });
  await expect(connect).toHaveAttribute('href', /returnTo=%2Fsetup%2Fgithub/u);
  await expect(
    page.getByRole('status').filter({ hasText: 'GitHub isn’t connected yet.' }),
  ).toBeAttached();
});

test('authorizing comes back linked, with every account and its install state', async () => {
  await ConnectStep.accounts()
    .getByRole('link', { name: 'Connect GitHub' })
    .click();

  await expect(page).toHaveURL('/setup/github');
  await expect(
    page.getByRole('status').filter({ hasText: 'GitHub is connected.' }),
  ).toBeVisible();
  await expect(ConnectStep.accounts().getByRole('listitem')).toHaveCount(5);
  await expect(ConnectStep.row('ada')).toContainText('Personal account');
  await expect(ConnectStep.row('acme-labs')).toContainText(
    'Organisation · you’re an owner',
  );
  await expect(ConnectStep.row('acme-labs')).toContainText('Installed');
  await expect(ConnectStep.row('acme-labs')).toContainText(
    '3 selected repositories',
  );
  await expect(ConnectStep.row('night-shift')).toContainText(
    'Organisation · you’re a member',
  );
  await expect(ConnectStep.row('old-co')).toContainText('Suspended');
  await expect(ConnectStep.row('rate-limited')).toContainText(
    'Installed · details missing',
  );
  await expect(ConnectStep.row('rate-limited')).toContainText('RL');
  await expect(
    page.getByRole('link', { name: 'Manage acme-labs' }),
  ).toHaveAttribute('href', 'https://github.com/settings/installations/1001');
});

test('installing on an account comes back installed', async () => {
  await page.getByRole('link', { name: 'Install app ada' }).click();

  await expect(page).toHaveURL('/setup/github');
  await expect(
    page.getByRole('status').filter({ hasText: /^Installed\./u }),
  ).toBeVisible();
  await expect(ConnectStep.row('ada')).toContainText('All repositories (12)');
  await expect(page.getByRole('link', { name: 'Manage ada' })).toBeVisible();
});

test('a request from GitHub’s picker says it waits for an owner', async () => {
  await page.getByRole('link', { name: 'Add another account' }).click();

  await expect(page).toHaveURL('/setup/github');
  await expect(
    page.getByRole('status').filter({
      hasText:
        'Request sent. The account appears here once an owner installs the app.',
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText('Request sent.')).toHaveCount(0);
});

test('a failed trip to GitHub is announced as an alert', async () => {
  await page.goto('/setup/github?connect=error&provider=github&reason=denied');

  await expect(page).toHaveURL('/setup/github');
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'GitHub access wasn’t granted.' }),
  ).toBeVisible();
});

test('a list that fails to load can be tried again', async () => {
  await ConnectStep.scenario('failing');
  await page.reload();

  await expect(
    page
      .getByRole('region', { name: 'GitHub accounts' })
      .getByText(/couldn’t load your GitHub accounts/u),
  ).toBeVisible();
  await ConnectStep.scenario('linked');
  await page.getByRole('button', { name: 'Try again' }).click();

  await expect(ConnectStep.accounts().getByRole('listitem')).toHaveCount(5);
  await expect(ConnectStep.accounts()).toBeFocused();
});

test('coming back to the tab refreshes the list quietly', async () => {
  const refresh = async (status: number): Promise<void> => {
    const answered = page.waitForResponse(
      (response) =>
        response.url().includes('/integrations/github/accounts') &&
        response.status() === status,
    );
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await answered;
  };
  await ConnectStep.scenario('failing');
  await refresh(502);
  await expect(ConnectStep.accounts().getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await expect(page.getByText(/couldn’t load/u)).toHaveCount(0);

  await ConnectStep.scenario('linked');
  await page.request.get(
    `${missionControl}/integrations/github/__stub/install?login=night-shift`,
    { maxRedirects: 0 },
  );
  await refresh(200);
  await expect(ConnectStep.row('night-shift')).toContainText(
    'All repositories (12)',
  );
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

test('Skip for now and Continue both go home', async () => {
  await page.getByRole('link', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/setup/github');
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page).toHaveURL('/');
});
