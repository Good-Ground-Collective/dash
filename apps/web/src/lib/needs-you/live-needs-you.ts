import { createSubscriber } from 'svelte/reactivity';
import { z } from 'zod';
import type { LiveEventStream } from '#lib/live/live-event-stream.ts';
import type { NeedsYouReads } from '#lib/needs-you/http-needs-you.ts';
import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';
import { NeedsYouLiveEvents } from '#lib/needs-you/needs-you-live-events.ts';
import type { NeedsYouSession } from '#lib/needs-you/needs-you-session-contracts.ts';
import { NeedsYouSessions } from '#lib/needs-you/needs-you-sessions.ts';
import { OpenNeedsYouItems } from '#lib/needs-you/open-needs-you-items.ts';

const maxResyncAttempts = 3;

export const liveNeedsYouPropsSchema = z.object({
  initial: z
    .custom<readonly NeedsYouItem[]>((value) => Array.isArray(value))
    .describe('What the page was rendered with.'),
  sessions: z
    .custom<readonly NeedsYouSession[]>((value) => Array.isArray(value))
    .describe('The sessions the page was rendered with.'),
  stream: z.custom<LiveEventStream>(
    (value) => value instanceof Object && 'subscribe' in value,
  ),
  reads: z.custom<NeedsYouReads>(
    (value) => value instanceof Object && 'listOpen' in value,
  ),
});

export type LiveNeedsYouProps = z.input<typeof liveNeedsYouPropsSchema>;

/** The items waiting on the signed-in person, as the shell shows them. Read `items` and `count` inside a reactive scope. */
export interface NeedsYouFeed {
  readonly items: readonly NeedsYouItem[];
  readonly count: number;
  /** Where the item's agent is running, such as “claude-code on studio-mini”. `null` until its session is known. */
  where(item: NeedsYouItem): string | null;
  /** Replaces the list with what the server just rendered. */
  reset(props: {
    items: readonly NeedsYouItem[];
    sessions: readonly NeedsYouSession[];
  }): void;
  /** Follows Mission Control's live events until the returned function is called. */
  start(): () => void;
}

/** Keeps the list current from `needs-you.opened` and `needs-you.resolved`, and re-reads it whenever the connection opens so events missed in between don't leave it stale. */
export class LiveNeedsYou implements NeedsYouFeed {
  private readonly stream: LiveEventStream;
  private readonly reads: NeedsYouReads;
  private readonly changed = new Set<() => void>();
  private readonly track = createSubscriber((update) => {
    this.changed.add(update);
    return () => {
      this.changed.delete(update);
    };
  });
  private open: OpenNeedsYouItems;
  private sessions: NeedsYouSessions;
  private changes = 0;
  private readingSessions = false;

  constructor(props: LiveNeedsYouProps) {
    const valid = liveNeedsYouPropsSchema.parse(props);
    this.stream = valid.stream;
    this.reads = valid.reads;
    this.open = OpenNeedsYouItems.of(valid.initial);
    this.sessions = NeedsYouSessions.of(valid.sessions);
  }

  get items(): readonly NeedsYouItem[] {
    this.track();
    return this.open.items;
  }

  get count(): number {
    this.track();
    return this.open.count;
  }

  where(item: NeedsYouItem): string | null {
    this.track();
    return this.sessions.where(item);
  }

  reset(props: {
    items: readonly NeedsYouItem[];
    sessions: readonly NeedsYouSession[];
  }): void {
    this.sessions = NeedsYouSessions.of(props.sessions);
    this.replace(OpenNeedsYouItems.of(props.items));
  }

  start(): () => void {
    const stopOpened = this.stream.subscribe({
      definition: NeedsYouLiveEvents.OPENED,
      onEvent: (item) => {
        this.replace(this.open.opened(item));
        if (this.sessions.missingFor([item])) void this.refreshSessions();
      },
      onOpen: () => void this.resync(),
    });
    const stopResolved = this.stream.subscribe({
      definition: NeedsYouLiveEvents.RESOLVED,
      onEvent: (item) => this.replace(this.open.resolved(item)),
    });

    return () => {
      stopOpened();
      stopResolved();
    };
  }

  private replace(open: OpenNeedsYouItems): void {
    this.changes += 1;
    this.open = open;
    this.notify();
  }

  private notify(): void {
    for (const update of this.changed) update();
  }

  /** One read at a time. A read that fails leaves the sessions as they are. */
  private async refreshSessions(): Promise<void> {
    if (this.readingSessions) return;
    this.readingSessions = true;
    try {
      this.sessions = NeedsYouSessions.of(await this.reads.listSessions());
      this.notify();
    } catch {
      return;
    } finally {
      this.readingSessions = false;
    }
  }

  /** An event that lands while the read is in flight makes the read stale, so it goes again. A read that fails leaves the list as it is. */
  private async resync(): Promise<void> {
    for (let attempt = 0; attempt < maxResyncAttempts; attempt += 1) {
      const before = this.changes;
      try {
        const [items, sessions] = await Promise.all([
          this.reads.listOpen(),
          this.reads.listSessions().catch(() => null),
        ]);
        if (this.changes === before) {
          if (sessions !== null) this.sessions = NeedsYouSessions.of(sessions);
          this.replace(OpenNeedsYouItems.of(items));
          return;
        }
      } catch {
        return;
      }
    }
  }
}
