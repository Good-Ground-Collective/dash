import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';

/** The items waiting on the person, newest first. Each change returns a new list. */
export class OpenNeedsYouItems {
  readonly items: readonly NeedsYouItem[];

  private constructor(items: readonly NeedsYouItem[]) {
    this.items = items;
  }

  get count(): number {
    return this.items.length;
  }

  /** An item already listed is replaced, not doubled. */
  opened(item: NeedsYouItem): OpenNeedsYouItems {
    return OpenNeedsYouItems.of([
      ...this.items.filter((existing) => existing.id !== item.id),
      item,
    ]);
  }

  resolved(item: NeedsYouItem): OpenNeedsYouItems {
    return OpenNeedsYouItems.of(
      this.items.filter((existing) => existing.id !== item.id),
    );
  }

  static of(items: readonly NeedsYouItem[]): OpenNeedsYouItems {
    const open = items.filter((item) => item.resolvedAt === null);
    const newestFirst = open.toSorted(
      (left, right) => right.openedAt.getTime() - left.openedAt.getTime(),
    );
    return new OpenNeedsYouItems(newestFirst);
  }
}
