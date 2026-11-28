import { expect, type Page, test, type TestInfo } from '@playwright/test';
import { z } from 'zod';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

const themes = ['characters'] as const;
const modes = ['light', 'dark'] as const;
const screens = [
  { name: 'home', path: '/' },
  { name: 'home-all-objectives', path: '/?show=parked,done' },
  { name: 'github', path: '/github' },
  { name: 'github-mine', path: '/github?tab=mine' },
  { name: 'github-assigned', path: '/github?tab=assigned' },
  { name: 'settings-profile', path: '/settings/profile' },
  { name: 'settings-appearance', path: '/settings/appearance' },
  { name: 'settings-passkeys', path: '/settings/passkeys' },
  { name: 'settings-recovery-codes', path: '/settings/recovery-codes' },
  { name: 'settings-github', path: '/settings/github' },
  { name: 'settings-briefings', path: '/settings/briefings' },
  { name: 'service-accounts', path: '/settings/service-accounts' },
] as const;

const sampleAccounts = [
  { kind: 'bench', benchId: 'studio', name: 'Studio', hue: 'violet' },
  { kind: 'bench', benchId: 'mbp', name: 'MacBook Pro', hue: 'teal' },
  { kind: 'agent', agentName: 'rook', name: 'Rook', hue: 'blue' },
  { kind: 'agent', agentName: 'juno', name: 'Juno', hue: 'amber' },
] as const;

test.describe.configure({ mode: 'serial' });

let missionControl = '';

/** Captures each screen into the test report, for review across every theme and mode. Pixel baselines come later. */
class Screens {
  static async capture(props: {
    page: Page;
    name: string;
    testInfo: TestInfo;
  }): Promise<void> {
    await props.page.evaluate(async () => document.fonts.ready);
    await props.testInfo.attach(props.name, {
      body: await props.page.screenshot({
        fullPage: true,
        animations: 'disabled',
      }),
      contentType: 'image/png',
    });
  }
}

/** Home on a busy day: the six collapsed items, two of them expanded, and the same on a phone. */
class BusyDay {
  static async capture(props: {
    page: Page;
    missionControl: string;
    name: string;
    testInfo: TestInfo;
  }): Promise<void> {
    const { page, testInfo } = props;
    const shoot = async (view: string) =>
      Screens.capture({
        page,
        name: `home-busy-day-${view}-${props.name}.png`,
        testInfo,
      });

    await page.request.post(
      `${props.missionControl}/integrations/github/__stub/feed?name=busy-day`,
    );
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await shoot('collapsed');

    const since = page.getByRole('region', {
      name: 'Since yesterday',
      exact: true,
    });
    await since
      .getByRole('button', { name: /^Sign-in with passkeys/u })
      .click();
    await since.getByRole('button', { name: /^4 more epics/u }).click();
    await shoot('expanded');

    await page.setViewportSize({ width: 390, height: 844 });
    await shoot('expanded-mobile');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await shoot('collapsed-mobile');
    await page.setViewportSize({ width: 1280, height: 720 });
  }
}

test.beforeAll(async ({ request }, testInfo) => {
  missionControl = projectSettingsSchema.parse(
    testInfo.project.metadata,
  ).missionControlUrl;
  await request.post(`${missionControl}/api/auth/__stub/reset`);
});

for (const theme of themes) {
  for (const mode of modes) {
    test(`${theme} ${mode}: signed-in screens`, async ({ page }, testInfo) => {
      await page.request.post(`${missionControl}/api/auth/__stub/reset`);
      await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
      for (const account of sampleAccounts) {
        await page.request.post(
          `${missionControl}/api/auth/service-accounts/create`,
          {
            data: {
              ...account,
              description: `${account.name} on the desk`,
              scopes: ['heartbeat:write'],
            },
          },
        );
      }
      for (const stub of ['scenario?name=linked', 'feed?name=populated']) {
        await page.request.post(
          `${missionControl}/integrations/github/__stub/${stub}`,
        );
      }
      await page.request.post(
        `${missionControl}/objectives/__stub/scenario?name=populated`,
      );
      await page.request.post(
        `${missionControl}/briefing/__stub/scenario?name=ready`,
      );
      await page.request.post(`${missionControl}/api/auth/appearance/update`, {
        data: { theme, mode },
      });

      for (const screen of screens) {
        await page.goto(screen.path);
        await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
        await Screens.capture({
          page,
          name: `${screen.name}-${theme}-${mode}.png`,
          testInfo,
        });
      }

      await BusyDay.capture({
        page,
        missionControl,
        name: `${theme}-${mode}`,
        testInfo,
      });
    });

    test(`${theme} ${mode}: sign-in`, async ({
      browser,
      baseURL,
    }, testInfo) => {
      const context = await browser.newContext({ baseURL: baseURL ?? '' });
      await context.addCookies([
        { name: 'dash-theme', value: theme, url: baseURL ?? '' },
        { name: 'dash-mode', value: mode, url: baseURL ?? '' },
      ]);
      const page = await context.newPage();

      await page.goto('/sign-in');
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);

      await Screens.capture({
        page,
        name: `sign-in-${theme}-${mode}.png`,
        testInfo,
      });
      await page.goto('/recover');
      await Screens.capture({
        page,
        name: `recover-${theme}-${mode}.png`,
        testInfo,
      });
      await context.close();
    });
  }
}
