import type { Capability } from '#src/definitions/capabilities/capability.ts';
import { DuplicateCapabilityError } from '#src/errors.ts';

/** The capabilities one integration offers. Providers build one and delegate `capability()` to it. */
export interface Capabilities {
  /** A new set that also offers `capability`. Throws if this set already offers it. */
  with<T extends object>(
    capability: Capability<T>,
    implementation: T,
  ): Capabilities;
  get<T extends object>(capability: Capability<T>): T | undefined;
}

/** An immutable `Capabilities` keyed by capability name. Start from `CapabilitySet.empty()`. */
export class CapabilitySet implements Capabilities {
  private readonly implementations: ReadonlyMap<string, object>;

  private constructor(props: { implementations: ReadonlyMap<string, object> }) {
    this.implementations = props.implementations;
  }

  with<T extends object>(
    capability: Capability<T>,
    implementation: T,
  ): Capabilities {
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
    // SAFETY: `with` is the only writer, and each capability name belongs to exactly one interface (keys are declared once, in capabilities.ts).
    return this.implementations.get(capability.name) as T | undefined;
  }

  static empty(): Capabilities {
    return new CapabilitySet({ implementations: new Map() });
  }
}
