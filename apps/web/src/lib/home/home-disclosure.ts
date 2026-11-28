import { z } from 'zod';

export const homeDisclosurePropsSchema = z.object({
  open: z.array(z.string()).default([]),
});

export type HomeDisclosureProps = z.input<typeof homeDisclosurePropsSchema>;

/** Which collapsible Home items are expanded, by id. Everything starts collapsed, so a long plan or a busy day still reads at a glance. */
export class HomeDisclosure {
  private readonly open: ReadonlySet<string>;

  constructor(props: HomeDisclosureProps = {}) {
    this.open = new Set(homeDisclosurePropsSchema.parse(props).open);
  }

  get openIds(): string[] {
    return [...this.open];
  }

  isOpen(id: string): boolean {
    return this.open.has(id);
  }

  /** A new disclosure with `id` flipped, leaving every other item as it was. */
  toggled(id: string): HomeDisclosure {
    const open = new Set(this.open);
    if (open.has(id)) open.delete(id);
    else open.add(id);
    return new HomeDisclosure({ open: [...open] });
  }
}
