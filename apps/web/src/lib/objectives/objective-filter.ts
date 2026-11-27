import { z } from 'zod';
import type { ObjectiveStatus } from '#lib/api/objectives-contracts.ts';

export const showParam = 'show';

const hiddenByDefault = ['parked', 'done'] as const;

type HiddenStatus = (typeof hiddenByDefault)[number];

const shownSchema = z
  .string()
  .nullable()
  .transform((value) =>
    hiddenByDefault.filter((status) =>
      (value ?? '').split(',').some((part) => part.trim() === status),
    ),
  );

/** The page's URL, or the read-only one `page.url` gives in the browser. */
interface FilterUrl {
  pathname: string;
  searchParams: Pick<URLSearchParams, 'get' | 'toString'>;
}

export const objectiveFilterPropsSchema = z.object({
  url: z.custom<FilterUrl>(),
});

export type ObjectiveFilterProps = z.input<typeof objectiveFilterPropsSchema>;

export interface ObjectiveFilterOption {
  status: HiddenStatus;
  label: string;
  /** The same page with this status toggled, keeping the rest of the query. */
  href: string;
  shown: boolean;
}

const labels = {
  parked: 'Show parked',
  done: 'Show done',
} satisfies Record<HiddenStatus, string>;

/** Home shows active initiatives and epics; `?show=parked,done` adds the others. Unknown values are ignored. */
export class ObjectiveFilter {
  readonly shown: readonly HiddenStatus[];
  private readonly url: FilterUrl;

  constructor(props: ObjectiveFilterProps) {
    this.url = objectiveFilterPropsSchema.parse(props).url;
    this.shown = shownSchema.parse(this.url.searchParams.get(showParam));
  }

  get statuses(): ObjectiveStatus[] {
    return ['active', ...this.shown];
  }

  get showsEverything(): boolean {
    return this.shown.length === hiddenByDefault.length;
  }

  get options(): ObjectiveFilterOption[] {
    return hiddenByDefault.map((status) => {
      const shown = this.shown.includes(status);
      const next = shown
        ? this.shown.filter((entry) => entry !== status)
        : hiddenByDefault.filter(
            (entry) => entry === status || this.shown.includes(entry),
          );
      return { status, label: labels[status], href: this.hrefFor(next), shown };
    });
  }

  private hrefFor(shown: readonly HiddenStatus[]): string {
    const query = new URLSearchParams(this.url.searchParams.toString());
    if (shown.length === 0) query.delete(showParam);
    else query.set(showParam, shown.join(','));
    const search = query.toString();
    return search === '' ? this.url.pathname : `${this.url.pathname}?${search}`;
  }
}
