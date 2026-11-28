import type { Page } from '@playwright/test';

/** The colours the Agents page resolves to, read from the page, next to what the design tokens resolve to. */
export class AgentsPalette {
  static async read(page: Page) {
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
      const lost = '[data-session-key$="session-cloud-lost"]';
      const stale = '[data-session-key$="session-cloud-stale"]';
      return {
        surface: token('--surface', 'backgroundColor'),
        ink: token('--ink', 'color'),
        inkMuted: token('--ink-muted', 'color'),
        ok: token('--ok', 'color'),
        okSurface: token('--ok-surface', 'backgroundColor'),
        warn: token('--warn', 'color'),
        warnSurface: token('--warn-surface', 'backgroundColor'),
        bad: token('--bad', 'color'),
        badSurface: token('--bad-surface', 'backgroundColor'),
        panel: paint('section[aria-labelledby="sessions-title"]'),
        name: paint('li.session .name'),
        where: paint('li.session .where'),
        working: paint('li.session .pill[data-tone="ok"]'),
        stale: paint(`${stale} .pill[data-tone="warn"]`),
        lost: paint(`${lost} .pill[data-tone="bad"]`),
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
