/** Stands in for the browser's `EventSource`, which tests drive by hand. */
export class FakeEventSource extends EventTarget {
  readyState = 0;
  readonly url: string;
  readonly withCredentials: boolean;

  // eslint-disable-next-line preflight/constructor-single-props -- mirrors the browser's EventSource(url, init) signature
  constructor(url: string | URL, init?: { withCredentials?: boolean }) {
    super();
    this.url = String(url);
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.INSTANCES.push(this);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  open(): void {
    this.readyState = FakeEventSource.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  send(props: { type: string; data: string }): void {
    this.dispatchEvent(new MessageEvent(props.type, { data: props.data }));
  }

  dropAndRetry(): void {
    this.readyState = FakeEventSource.CONNECTING;
    this.dispatchEvent(new Event('error'));
  }

  refuse(): void {
    this.readyState = FakeEventSource.CLOSED;
    this.dispatchEvent(new Event('error'));
  }

  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static INSTANCES: FakeEventSource[] = [];

  static latest(): FakeEventSource {
    const latest = FakeEventSource.INSTANCES.at(-1);
    if (latest === undefined) throw new NoConnectionError();
    return latest;
  }
}

export class NoConnectionError extends Error {
  override name = 'NoConnectionError';

  constructor() {
    super('No connection was opened');
  }
}
