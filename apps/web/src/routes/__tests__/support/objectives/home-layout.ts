import type { Page } from '@playwright/test';

/** How the whole Home page lays out in the viewport, measured in the browser. */
export class HomeLayout {
  /** How far the page scrolls sideways past the viewport. */
  static async sidewaysOverflow(page: Page): Promise<number> {
    return page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
  }

  /**
   * Scrolled to the bottom, the space between the Since yesterday region and the Needs you
   * pill; undefined when either is missing, so a renamed element can't pass as a gap.
   */
  static async gapAboveNeedsYouPill(page: Page): Promise<number | undefined> {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const pill = await page
      .getByRole('button', { name: /^Needs you/u })
      .boundingBox();
    const last = await page
      .getByRole('region', { name: 'Since yesterday', exact: true })
      .boundingBox();
    return pill === null || last === null
      ? undefined
      : pill.y - (last.y + last.height);
  }
}
