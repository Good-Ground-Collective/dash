import type { Locator } from '@playwright/test';

export interface EpicGeometry {
  title: string;
  chipBesideTitle: boolean;
  rowHeight: number;
}

/**
 * Browser-measured layout of the objectives tree: epic rows (chip, title,
 * height), progress tracks, actions-button position, and an initiative's
 * count text.
 */
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

  /** One epic's geometry, by title. */
  static async of(
    panel: Locator,
    title: string,
  ): Promise<EpicGeometry | undefined> {
    const all = await EpicGeometries.measure(panel);
    return all.find((candidate) => candidate.title === title);
  }

  /** How many progress tracks there are, and how many distinct left edges and widths they have. */
  static async trackLayout(
    panel: Locator,
  ): Promise<{ count: number; lefts: number; widths: number }> {
    const boxes = await panel
      .locator('[aria-label^="Epics in"] > li .track')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { x: box.x, width: box.width };
        }),
      );
    return {
      count: boxes.length,
      lefts: new Set(boxes.map((box) => box.x)).size,
      widths: new Set(boxes.map((box) => box.width)).size,
    };
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

  /** The left edge of an epic's actions button. */
  static async menuX(
    panel: Locator,
    title: string,
  ): Promise<number | undefined> {
    const box = await panel
      .getByRole('button', { name: `Change ${title}` })
      .boundingBox();
    return box?.x;
  }

  /** The height of the one row matching the text. */
  static async rowHeight(
    rows: Locator,
    title: string,
  ): Promise<number | undefined> {
    return (await rows.filter({ hasText: title }).boundingBox())?.height;
  }
}
