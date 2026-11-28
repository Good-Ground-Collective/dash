import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { AgentsPalette } from './support/live/agents/agents-palette.ts';
import { BriefingDriver } from './support/live/briefings/briefing-driver.ts';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';
let briefing: BriefingDriver;

/** The Agents page as the person sees it, and the stub's control over what Mission Control says. */
class Sessions {
  static session(name: string): ReturnType<Page['locator']> {
    return page.locator('li.session', { hasText: name });
  }

  static bench(id: string): ReturnType<Page['locator']> {
    return page.locator(`li.bench[data-bench="${id}"]`);
  }

  static toggle(name: string): ReturnType<Page['locator']> {
    return Sessions.session(name).getByRole('button', {
      name: /^Subagents of/u,
    });
  }

  static async scenario(name: string): Promise<void> {
    await page.request.post(
      `${missionControl}/api/agents/__stub/scenario?name=${name}`,
    );
  }

  static async change(name: string): Promise<void> {
    await page.request.post(
      `${missionControl}/api/agents/__stub/change?name=${name}`,
    );
  }

  static async open(): Promise<void> {
    await page.goto('/agents');
    await briefing.listening();
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
  briefing = new BriefingDriver({ page, missionControl });
  await page.request.post(`${missionControl}/api/auth/__stub/reset`);
  await page.request.post(`${missionControl}/api/auth/__stub/sign-in`);
});

test('an empty list says nothing has reported and the nav link is on', async () => {
  await Sessions.scenario('empty');
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Agents' })
    .click();

  await expect(page).toHaveURL(/\/agents$/u);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Agents');
  await expect(
    page.getByText('No agent has reported in the last 24 hours.'),
  ).toBeVisible();
  await expect(page.locator('li.session')).toHaveCount(0);
});

test('sessions are grouped by bench with the latest activity first', async () => {
  await Sessions.scenario('several');
  await page.goto('/agents');

  await expect(page.locator('li.bench').locator('h3')).toHaveText([
    /studio-mini/u,
    /cloud-1/u,
    /lab-pi/u,
    /No bench/u,
  ]);
  await expect(
    Sessions.bench('cloud-1').locator('li.session .name'),
  ).toHaveText(['cloud-1', 'cloud-1', 'cloud-1']);
  await expect(
    Sessions.bench('cloud-1').locator('li.session .doing .summary'),
  ).toHaveText([
    'Running the nightly triage',
    'Waiting on the package index',
    'Reindexing the archive',
  ]);

  const orchestrator = Sessions.session('studio-hooks');
  await expect(orchestrator).toContainText('claude-code · 7 subagents');
  await expect(orchestrator).toContainText('Splitting the outbox relay');
  await expect(orchestrator).toContainText('dash · feat/outbox-relay');
  await expect(orchestrator).toContainText('1 minute ago');
  await expect(Sessions.session('release-bot')).toContainText(
    'Ship the standards package as 1.1.0 or 2.0.0?',
  );
});

test('stale and lost sessions are flagged, and the totals count them', async () => {
  await expect(
    page.locator('li.session[data-liveness="stale"] .state'),
  ).toContainText('Stale');
  await expect(
    page.locator('li.session[data-liveness="lost"] .state'),
  ).toContainText('Lost');

  for (const [label, count] of [
    ['Active now', '3'],
    ['Need you', '2'],
    ['Stale or lost', '2'],
  ] as const) {
    await expect(
      page.locator('dl.stats .tile', { hasText: label }),
    ).toContainText(count);
  }
});

test('subagents roll up into one row and expand to list each one', async () => {
  const orchestrator = Sessions.session('studio-hooks');
  await expect(orchestrator.locator('.rollup')).toHaveText(
    '4 working, 1 asking, 2 done, 1 stale',
  );
  await expect(orchestrator.locator('li.subagent')).toHaveCount(0);

  await Sessions.toggle('studio-hooks').click();

  await expect(Sessions.toggle('studio-hooks')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(orchestrator.locator('li.subagent')).toHaveCount(7);
  const asking = orchestrator.locator(
    'li.subagent[data-agent-id="schema-checker"]',
  );
  await expect(asking).toContainText('Asking');
  await expect(asking).toContainText(
    'Which outbox path should be the default?',
  );
  await expect(
    orchestrator.locator('li.subagent[data-agent-id="stuck-reader"]'),
  ).toContainText('Stale');
  await expect(page.locator('li.session')).toHaveCount(6);
});

test('a live event updates the rollup, a session’s liveness and the groups without a reload', async () => {
  await page.evaluate(() => {
    Object.assign(window, { stayedOnThisPage: true });
  });

  await Sessions.change('subagent-done');
  await expect(Sessions.session('studio-hooks').locator('.rollup')).toHaveText(
    '3 working, 1 asking, 3 done, 1 stale',
  );
  await expect(
    Sessions.session('studio-hooks').locator(
      'li.subagent[data-agent-id="hooks-builder"]',
    ),
  ).toContainText('Done');

  await Sessions.change('subagent-new');
  await expect(
    Sessions.session('studio-hooks').locator('li.subagent'),
  ).toHaveCount(8);
  await expect(Sessions.session('studio-hooks').locator('.rollup')).toHaveText(
    '4 working, 1 asking, 3 done, 1 stale',
  );
  await expect(page.locator('li.session')).toHaveCount(6);

  await Sessions.change('session-stale');
  const cloud = page.locator(
    'li.session[data-session-key$="session-cloud-live"]',
  );
  await expect(cloud).toHaveAttribute('data-liveness', 'stale');
  await expect(cloud.locator('.state')).toContainText('Stale');
  await Sessions.change('session-lost');
  await expect(cloud.locator('.state')).toContainText('Lost');
  await Sessions.change('session-live-again');
  await expect(cloud).toHaveAttribute('data-liveness', 'live');

  await Sessions.change('new-session');
  await expect(Sessions.bench('lab-pi').locator('li.session')).toHaveCount(2);
  await expect(
    Sessions.bench('lab-pi').locator('li.session').first(),
  ).toContainText('lab-bot');

  expect(await page.evaluate(() => 'stayedOnThisPage' in window)).toBe(true);
});

test('agent-provided text shows as plain text', async () => {
  await expect(
    page.getByText('<img src=x onerror=alert(1)> Finished the migration'),
  ).toBeVisible();
  await expect(page.getByText('<b>laptop</b>')).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(page.locator('li.session b')).toHaveCount(0);
});

test('the page catches up after the connection drops and events were missed', async () => {
  await Sessions.scenario('empty');
  await Sessions.open();
  await expect(page.locator('li.session')).toHaveCount(0);

  await Sessions.scenario('several');
  await briefing.control('drop');

  await expect(page.locator('li.session')).toHaveCount(6);
});

test('a phone gets stacked rows without sideways scrolling', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await Sessions.open();
  await Sessions.toggle('studio-hooks').click();

  await expect(
    Sessions.session('studio-hooks').locator('li.subagent'),
  ).toHaveCount(7);
  expect(await Sessions.overflow()).toBeLessThanOrEqual(0);
  const row = await Sessions.session('studio-hooks').boundingBox();
  expect((row?.x ?? -1) + (row?.width ?? 999)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 800 });
});

const minimumContrast = 4.5;
const backgrounds = new Map<string, number[]>();

for (const mode of ['light', 'dark'] as const) {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'phone', width: 390, height: 844 },
  ] as const) {
    test(`${mode} ${viewport.name}: rows use the tokens and stay readable`, async () => {
      await page.request.post(`${missionControl}/api/auth/appearance/update`, {
        data: { theme: 'characters', mode },
      });
      await page.setViewportSize(viewport);
      await Sessions.open();
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await expect(page.locator('li.session')).toHaveCount(6);

      const palette = await AgentsPalette.read(page);

      expect(palette.panel.background).toEqual(palette.surface);
      expect(palette.name.color).toEqual(palette.ink);
      expect(palette.where.color).toEqual(palette.inkMuted);
      expect(palette.working).toEqual({
        color: palette.ok,
        background: palette.okSurface,
      });
      expect(palette.stale).toEqual({
        color: palette.warn,
        background: palette.warnSurface,
      });
      expect(palette.lost).toEqual({
        color: palette.bad,
        background: palette.badSurface,
      });
      for (const [text, behind] of [
        [palette.working.color, palette.working.background],
        [palette.stale.color, palette.stale.background],
        [palette.lost.color, palette.lost.background],
        [palette.name.color, palette.panel.background],
        [palette.where.color, palette.panel.background],
      ] as const) {
        expect(AgentsPalette.contrast(text, behind)).toBeGreaterThanOrEqual(
          minimumContrast,
        );
      }
      expect(await Sessions.overflow()).toBeLessThanOrEqual(0);
      backgrounds.set(`${mode}-${viewport.name}`, palette.panel.background);
    });
  }
}

test('dark mode changes the page’s colours from light mode', async () => {
  expect(backgrounds.get('dark-desktop')).not.toEqual(
    backgrounds.get('light-desktop'),
  );
  await page.request.post(`${missionControl}/api/auth/appearance/update`, {
    data: { theme: 'characters', mode: 'light' },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('a Needs you item links to its session, which opens with its subagents', async () => {
  await page.request.post(
    `${missionControl}/api/needs-you/__stub/open?item=outbox`,
  );
  await page.goto('/');
  await briefing.listening();
  await page.getByRole('button', { name: /^Needs you, \d+ waiting$/u }).click();
  const panel = page.getByRole('dialog', { name: 'Needs you' });

  await panel.getByRole('link', { name: 'Go to session' }).click();

  await expect(page).toHaveURL(
    /\/agents\?reportedBy=.+&session=session-outbox-1$/u,
  );
  await expect(panel).toBeHidden();
  const session = Sessions.session('studio-hooks');
  await expect(session).toHaveAttribute('aria-current', 'true');
  await expect(session).toBeInViewport();
  await expect(
    session.locator('li.subagent[data-agent-id="hooks-builder"]'),
  ).toBeVisible();
  await page.request.post(
    `${missionControl}/api/needs-you/__stub/resolve?item=outbox`,
  );
});
