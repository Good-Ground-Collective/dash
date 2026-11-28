import { z } from 'zod';

type StorageArea = Pick<Storage, 'getItem' | 'setItem'>;

export const browserDisclosureStorePropsSchema = z.object({
  key: z.string().min(1),
});

export type BrowserDisclosureStoreProps = z.input<
  typeof browserDisclosureStorePropsSchema
>;

const openIdsSchema = z.string().transform((raw, context): string[] => {
  const parsed = z.array(z.string()).safeParse(JSON.parse(raw));
  if (parsed.success) return parsed.data;
  context.addIssue({ code: 'custom', message: 'Not a list of ids' });
  return z.NEVER;
});

/**
 * Remembers which Home items a person expanded, in this browser. Storage can be missing,
 * full or blocked, and Home must still work, so a failed read means everything is collapsed
 * and a failed write is dropped.
 */
export class BrowserDisclosureStore {
  private readonly key: string;

  constructor(props: BrowserDisclosureStoreProps) {
    const valid = browserDisclosureStorePropsSchema.parse(props);
    this.key = valid.key;
  }

  readOpenIds(): string[] {
    try {
      const raw = this.area().getItem(this.key);
      if (raw === null) return [];
      const parsed = openIdsSchema.safeParse(raw);
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }

  writeOpenIds(ids: string[]): void {
    try {
      this.area().setItem(this.key, JSON.stringify(ids));
    } catch {
      return;
    }
  }

  private area(): StorageArea {
    return localStorage;
  }
}
