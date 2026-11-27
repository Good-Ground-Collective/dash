import type { Capability } from '#src/definitions/capabilities/capability.ts';
import { DuplicateCapabilityError } from '#src/errors.ts';

/** The capabilities one integration offers, keyed by capability name. Providers build one and delegate `capability()` to it. */
export class CapabilitySet {
  private readonly implementations: ReadonlyMap<string, object>;

  constructor(props: { implementations?: ReadonlyMap<string, object> } = {}) {
    this.implementations = props.implementations ?? new Map();
  }

  with<T extends object>(
    capability: Capability<T>,
    implementation: T,
  ): CapabilitySet {
    if (this.implementations.has(capability.name)) {
      throw new DuplicateCapabilityError({ capabilityName: capability.name });
    }
    return new CapabilitySet({
      implementations: new Map([
        ...this.implementations,
        [capability.name, implementation],
      ]),
    });
  }

  get<T extends object>(capability: Capability<T>): T | undefined {
    // SAFETY: `with` is the only writer and stores each implementation under its own capability's name.
    return this.implementations.get(capability.name) as T | undefined;
  }
}
