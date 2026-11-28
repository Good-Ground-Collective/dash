import { z } from 'zod';
import {
  jsonTextSchema,
  MissionControlEndpoint,
  missionControlBaseUrlSchema,
} from '#lib/api/mission-control-endpoint.ts';
import type {
  LiveEventStream,
  LiveSubscription,
} from '#lib/live/live-event-stream.ts';

export const browserLiveEventStreamPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  reconnectDelayMs: z
    .number()
    .int()
    .positive()
    .default(5000)
    .describe(
      'How long to wait before reopening a connection the browser gave up on, such as after a refused session.',
    ),
});

const frameDataSchema = z.string();

export type BrowserLiveEventStreamProps = z.input<
  typeof browserLiveEventStreamPropsSchema
>;

interface Registration {
  readonly name: string;
  readonly deliver: (data: string) => void;
  readonly onOpen: LiveSubscription<unknown>['onOpen'];
}

/** One `EventSource` per tab however many subscribers there are. It opens with the first, sends credentials, closes with the last, and reopens after the browser gives up on it. */
export class BrowserLiveEventStream implements LiveEventStream {
  private readonly url: URL;
  private readonly reconnectDelayMs: number;
  private readonly registrations = new Set<Registration>();
  private readonly listeners = new Map<string, EventListener>();
  private source: EventSource | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private interrupted = false;

  constructor(props: BrowserLiveEventStreamProps) {
    const valid = browserLiveEventStreamPropsSchema.parse(props);
    this.url = new MissionControlEndpoint({ baseUrl: valid.baseUrl }).url(
      'events',
    );
    this.reconnectDelayMs = valid.reconnectDelayMs;
  }

  subscribe<T>(subscription: LiveSubscription<T>): () => void {
    const { definition } = subscription;
    const frame = jsonTextSchema.pipe(definition.schema);
    const registration: Registration = {
      name: definition.name,
      deliver: (data) => {
        const parsed = frame.safeParse(data);
        if (parsed.success) {
          subscription.onEvent(parsed.data);
          return;
        }
        console.warn(`Ignored a malformed ${definition.name} event`);
      },
      onOpen: subscription.onOpen,
    };
    this.registrations.add(registration);

    if (this.source !== null) {
      this.listen(this.source, registration.name);
      if (this.source.readyState === EventSource.OPEN) {
        registration.onOpen?.({ reconnected: false });
      }
    } else if (this.retry === null) {
      this.connect();
    }

    return () => this.release(registration);
  }

  private connect(): void {
    const source = new EventSource(this.url, { withCredentials: true });
    this.source = source;
    this.listeners.clear();
    for (const registration of this.registrations) {
      this.listen(source, registration.name);
    }

    source.addEventListener('open', () => {
      if (this.source !== source) return;
      const reconnected = this.interrupted;
      this.interrupted = false;
      for (const registration of [...this.registrations]) {
        registration.onOpen?.({ reconnected });
      }
    });
    source.addEventListener('error', () => {
      if (this.source !== source) return;
      this.interrupted = true;
      if (source.readyState === EventSource.CLOSED) this.reopenLater();
    });
  }

  private listen(source: EventSource, name: string): void {
    if (this.listeners.has(name)) return;
    const listener = (message: Event): void => {
      if (!(message instanceof MessageEvent)) return;
      const data = frameDataSchema.safeParse(message.data);
      if (!data.success) return;
      for (const registration of [...this.registrations]) {
        if (registration.name === name) registration.deliver(data.data);
      }
    };
    this.listeners.set(name, listener);
    source.addEventListener(name, listener);
  }

  private reopenLater(): void {
    this.source = null;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.registrations.size > 0) this.connect();
    }, this.reconnectDelayMs);
  }

  private release(registration: Registration): void {
    this.registrations.delete(registration);
    if (this.registrations.size === 0) {
      this.close();
      return;
    }

    const stillWanted = [...this.registrations].some(
      (other) => other.name === registration.name,
    );
    const listener = this.listeners.get(registration.name);
    if (!stillWanted && listener !== undefined) {
      this.source?.removeEventListener(registration.name, listener);
      this.listeners.delete(registration.name);
    }
  }

  private close(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.source?.close();
    this.source = null;
    this.listeners.clear();
    this.interrupted = false;
  }
}
