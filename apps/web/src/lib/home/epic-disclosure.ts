import { z } from 'zod';

export const epicDisclosurePropsSchema = z.object({
  open: z.array(z.string()).default([]),
});

export type EpicDisclosureProps = z.input<typeof epicDisclosurePropsSchema>;

/** Which epics in Today's focus are expanded. Every epic starts collapsed, so a long plan still reads at a glance. */
export class EpicDisclosure {
  private readonly open: ReadonlySet<string>;

  constructor(props: EpicDisclosureProps = {}) {
    this.open = new Set(epicDisclosurePropsSchema.parse(props).open);
  }

  isOpen(id: string): boolean {
    return this.open.has(id);
  }

  /** A new disclosure with `id` flipped, leaving every other epic as it was. */
  toggled(id: string): EpicDisclosure {
    const open = new Set(this.open);
    if (open.has(id)) open.delete(id);
    else open.add(id);
    return new EpicDisclosure({ open: [...open] });
  }
}
