/** The cookies a load reads and writes, recording every write. */
export class RecordingCookies {
  readonly written = new Map<string, string>();
  private readonly values: Map<string, string>;

  constructor(props: { values?: Record<string, string> } = {}) {
    this.values = new Map(Object.entries(props.values ?? {}));
  }

  readonly get = (name: string): string | undefined => this.values.get(name);
  readonly set = (name: string, value: string): void => {
    this.written.set(name, value);
  };
}
