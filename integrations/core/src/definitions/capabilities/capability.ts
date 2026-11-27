/**
 * Names a capability and the interface that implements it. Business code asks an integration
 * for a capability by key and must handle `undefined`, which is the narrowing check.
 */
export class Capability<T extends object> {
  /** Type-only: ties the key to its interface so keys for different interfaces don't mix. */
  declare readonly implementation: T;
  readonly name: string;

  constructor(props: { name: string }) {
    this.name = props.name;
  }
}
