import { z } from 'zod';

export const capabilityPropsSchema = z.object({
  name: z.string().regex(/^[a-z][a-z\d-]*$/u),
});

/**
 * Names a capability and the interface that implements it. Business code asks an integration
 * for a capability by key and must handle `undefined`, which is the narrowing check. Keys are
 * matched by name, so each name must belong to exactly one interface: declare keys once, in
 * capabilities.ts, rather than constructing them ad hoc.
 */
export class Capability<T extends object> {
  /** Type-only: ties the key to its interface for type inference. */
  declare readonly implementation: T;
  readonly name: string;

  constructor(props: z.input<typeof capabilityPropsSchema>) {
    this.name = capabilityPropsSchema.parse(props).name;
  }
}
