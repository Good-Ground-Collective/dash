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
        const lead = item.querySelector('.lead');
        const title = item.querySelector('.title');
        const titleBox = title?.getBoundingClientRect();
        const chips = [...(lead?.children ?? [])].filter(
          (child) => !child.classList.contains('chevron') && child !== title,
        );
        const chipBox = chips[0]?.getBoundingClientRect();
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
}
