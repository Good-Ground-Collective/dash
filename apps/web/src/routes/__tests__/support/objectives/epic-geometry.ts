import type { Locator } from '@playwright/test';

export interface EpicGeometry {
  title: string;
  chipBesideTitle: boolean;
  rowHeight: number;
}

/** Where each epic's chip, title and row sit, measured in the browser. */
export class EpicGeometries {
  static async measure(panel: Locator): Promise<EpicGeometry[]> {
    return panel.locator('[aria-label^="Epics in"] > li').evaluateAll((items) =>
      items.map((item) => {
        const title = item.querySelector('.title');
        const titleBox = title?.getBoundingClientRect();
        const before = title?.previousElementSibling;
        const chipBox =
          before !== null &&
          before !== undefined &&
          !before.classList.contains('chevron')
            ? before.getBoundingClientRect()
            : undefined;
        return {
          title: title?.textContent.trim() ?? '',
          chipBesideTitle:
            chipBox !== undefined &&
            titleBox !== undefined &&
            titleBox.left >= chipBox.right &&
            titleBox.top < chipBox.bottom,
          rowHeight: Math.round(item.getBoundingClientRect().height),
        };
      }),
    );
  }

  /** The left edge and width of every epic's progress track. */
  static async trackBoxes(
    panel: Locator,
  ): Promise<{ x: number; width: number }[]> {
    return panel
      .locator('[aria-label^="Epics in"] > li .track')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { x: box.x, width: box.width };
        }),
      );
  }

  /** An initiative's count text, and whether it stays inside its progress box. */
  static async initiativeCount(
    panel: Locator,
    id: string,
  ): Promise<{ text: string; fits: boolean }> {
    return panel
      .locator(`[data-objective="${id}"] .head .progress`)
      .evaluate((meter) => {
        const label = meter.querySelector('.label');
        const labelBox = label?.getBoundingClientRect();
        const box = meter.getBoundingClientRect();
        return {
          text: label?.textContent.trim() ?? '',
          fits: labelBox !== undefined && labelBox.right <= box.right + 0.5,
        };
      });
  }
}
