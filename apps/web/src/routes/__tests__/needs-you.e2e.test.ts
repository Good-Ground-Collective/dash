import { expect, type Page, test } from '@playwright/test';
import { z } from 'zod';
import { BriefingDriver } from './support/live/briefings/briefing-driver.ts';

const projectSettingsSchema = z.object({ missionControlUrl: z.url() });

test.describe.configure({ mode: 'serial' });

let page: Page;
let missionControl = '';
let briefing: BriefingDriver;

/** The colours the bubble and its open panel resolve to, read from the page, next to what the design tokens resolve to. */
class Palette {
  static async read() {
    return page.evaluate(() => {
      const rgb = (value: string): number[] =>
        (value.match(/[\d.]+/gu) ?? []).slice(0, 3).map(Number);
      const token = (name: string, property: 'color' | 'backgroundColor') => {
        const probe = document.createElement('span');
        probe.style[property] = `var(${name})`;
        document.body.append(probe);
        const resolved = getComputedStyle(probe)[property];
        probe.remove();
        return rgb(resolved);
      };
      const paint = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) return { color: [-1], background: [-1] };
        const style = getComputedStyle(element);
        return {
          color: rgb(style.color),
          background: rgb(style.backgroundColor),
        };
      };
      return {
        surface: token('--surface', 'backgroundColor'),
        ink: token('--ink', 'color'),
        inkMuted: token('--ink-muted', 'color'),
        warn: token('--warn', 'color'),
        warnSurface: token('--warn-surface', 'backgroundColor'),
        panel: paint('[role="dialog"]'),
        pill: paint('[role="dialog"] .pill'),
        headline: paint('[role="dialog"] .headline'),
        meta: paint('[role="dialog"] .meta'),
        count: paint('.bubble .count'),
      };
    });
  }

  /** WCAG relative-luminance contrast ratio. */
  static contrast(foreground: number[], background: number[]): number {
    const luminance = (channels: number[]): number => {
      const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
        const unit = channel / 255;
        return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const [lighter = 0, darker = 0] = [
      luminance(foreground),
      luminance(background),
    ].toSorted((left, right) => right - left);
    return (lighter + 0.05) / (darker + 0.05);
  }
}

/** The Needs you bubble and its panel as the person sees them, and the stub's control over what Mission Control says. */
class Bubble {
  static button(count: number): ReturnType<Page['getByRole']> {
    return page.getByRole('button', { name: `Needs you, ${count} waiting` });
  }

  static panel(): ReturnType<Page['getByRole']> {
    return page.getByRole('dialog');
  }

  static rows(): ReturnType<Page['locator']> {
    return Bubble.panel().locator('li.item');
  }

  static async open(): Promise<void> {
    await page
      .getByRole('button', { name: /^Needs you, \d+ waiting$/u })
      .click();
    await expect(Bubble.panel()).toBeVisible();
  }

  static async scenario(name: string): Promise<void> {
    await page.request.post(
      `${missionControl}/api/needs-you/__stub/scenario?name=${name}`,
    );
  }

  static async opened(item: string): Promise<void> {
    await page.request.post(
      `${missionControl}/api/needs-you/__stub/open?item=${item}`,
    );
  }

  static async resolved(item: string): Promise<void> {
    await page.request.post(
      `${missionControl}/api/needs-you/__stub/resolve?item=${item}`,
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

test('an empty list keeps the empty state', async () => {
  await Bubble.scenario('empty');
  await page.goto('/');

  await expect(Bubble.button(0)).toBeVisible();
  await Bubble.open();
  await expect(page.getByText('Nothing needs you right now.')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('an item appears when Mission Control opens it and goes when it resolves, without a reload', async () => {
  await page.goto('/');
  await briefing.listening();
  await page.evaluate(() => {
    Object.assign(window, { stayedOnThisPage: true });
  });

  await Bubble.opened('outbox');
  await expect(Bubble.button(1)).toBeVisible();
  await Bubble.open();
  await expect(Bubble.rows()).toHaveCount(1);
  await expect(Bubble.rows().first()).toContainText(
    'Which outbox path should be the default?',
  );
  await expect(Bubble.rows().first()).toContainText('Question');
  await expect(Bubble.rows().first()).toContainText('hooks-builder');
  await expect(Bubble.rows().first()).toContainText(
    'claude-code on studio-mini',
  );
  await expect(Bubble.rows().first()).toContainText('just now');

  await Bubble.opened('options');
  await expect(Bubble.button(2)).toBeVisible();
  await expect(Bubble.rows()).toHaveCount(2);
  await expect(Bubble.rows().first()).toContainText(
    'Ship the standards package as 1.1.0 or 2.0.0?',
  );
  await expect(
    Bubble.rows().first().getByRole('list', { name: 'Options' }),
  ).toContainText('1.1.0');
  await expect(Bubble.rows().first()).toContainText('codex on cloud-1');

  await Bubble.resolved('outbox');
  await expect(Bubble.button(1)).toBeVisible();
  await expect(Bubble.rows()).toHaveCount(1);
  await Bubble.resolved('options');
  await expect(Bubble.button(0)).toBeVisible();
  await expect(page.getByText('Nothing needs you right now.')).toBeVisible();

  expect(await page.evaluate(() => 'stayedOnThisPage' in window)).toBe(true);
  await page.keyboard.press('Escape');
});

test('the count is right on first paint and matches the list', async () => {
  await Bubble.scenario('several');
  const html = await (await page.context().request.get('/')).text();
  expect(html).toContain('aria-label="Needs you, 4 waiting"');

  await page.goto('/');
  await expect(Bubble.button(4)).toBeVisible();
  await Bubble.open();
  await expect(Bubble.rows()).toHaveCount(4);
  await page.keyboard.press('Escape');
});

test('agent-provided text shows as plain text', async () => {
  await page.goto('/');
  await Bubble.open();

  await expect(
    Bubble.panel().getByText('<img src=x onerror=alert(1)> Run the migration?'),
  ).toBeVisible();
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(Bubble.panel()).toContainText('An agent is waiting for you');
  await expect(Bubble.panel()).toContainText('claude-code on studio-mini');
  await expect(Bubble.panel()).toContainText('session session-');
  await page.keyboard.press('Escape');
});

test('the list catches up after the connection drops and events were missed', async () => {
  await Bubble.scenario('empty');
  await page.goto('/');
  await briefing.listening();
  await expect(Bubble.button(0)).toBeVisible();

  await Bubble.scenario('several');
  await briefing.control('drop');

  await expect(Bubble.button(4)).toBeVisible();
});

test('the panel fits a phone and keeps the bubble in view', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await Bubble.open();

  const panel = await Bubble.panel().boundingBox();
  expect(panel?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((panel?.x ?? 0) + (panel?.width ?? 999)).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 800 });
});

const minimumContrast = 4.5;

const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
] as const;

const panelBackgrounds = new Map<string, number[]>();

for (const mode of ['light', 'dark'] as const) {
  for (const viewport of viewports) {
    test(`${mode} ${viewport.name}: the bubble and panel use the tokens and stay readable`, async () => {
      await Bubble.scenario('several');
      await page.request.post(`${missionControl}/api/auth/appearance/update`, {
        data: { theme: 'characters', mode },
      });
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
      await Bubble.open();
      await expect(Bubble.rows()).toHaveCount(4);

      const palette = await Palette.read();

      expect(palette.panel.background).toEqual(palette.surface);
      expect(palette.pill.color).toEqual(palette.warn);
      expect(palette.pill.background).toEqual(palette.warnSurface);
      expect(palette.count.color).toEqual(palette.warn);
      expect(palette.count.background).toEqual(palette.warnSurface);
      expect(palette.headline.color).toEqual(palette.ink);
      expect(palette.meta.color).toEqual(palette.inkMuted);
      for (const [text, behind] of [
        [palette.pill.color, palette.pill.background],
        [palette.count.color, palette.count.background],
        [palette.headline.color, palette.panel.background],
        [palette.meta.color, palette.panel.background],
      ] as const) {
        expect(Palette.contrast(text, behind)).toBeGreaterThanOrEqual(
          minimumContrast,
        );
      }
      panelBackgrounds.set(
        `${mode}-${viewport.name}`,
        palette.panel.background,
      );
      await page.keyboard.press('Escape');
    });
  }
}

test('dark mode changes the panel’s colours from light mode', async () => {
  expect(panelBackgrounds.get('dark-desktop')).not.toEqual(
    panelBackgrounds.get('light-desktop'),
  );
  expect(panelBackgrounds.get('dark-phone')).not.toEqual(
    panelBackgrounds.get('light-phone'),
  );
  await page.request.post(`${missionControl}/api/auth/appearance/update`, {
    data: { theme: 'characters', mode: 'light' },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
});
