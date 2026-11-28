import { createSubscriber } from 'svelte/reactivity';
import { z } from 'zod';
import type {
  AgentSession,
  AgentSessionState,
} from '#lib/agents/agent-session-contracts.ts';
import { AgentSessionLiveEvents } from '#lib/agents/agent-session-live-events.ts';
import { AgentSessions } from '#lib/agents/agent-sessions.ts';
import type { AgentSessionReads } from '#lib/agents/http-agent-sessions.ts';
import type { LiveEventStream } from '#lib/live/live-event-stream.ts';

const maxResyncAttempts = 3;

export const liveAgentSessionsPropsSchema = z.object({
  initial: z
    .custom<readonly AgentSession[]>((value) => Array.isArray(value))
    .describe('The sessions the page was rendered with.'),
  loaded: z
    .boolean()
    .describe('False when the page could not read the sessions.'),
  stream: z.custom<LiveEventStream>(
    (value) => value instanceof Object && 'subscribe' in value,
  ),
  reads: z.custom<AgentSessionReads>(
    (value) => value instanceof Object && 'list' in value,
  ),
});

export type LiveAgentSessionsProps = z.input<
  typeof liveAgentSessionsPropsSchema
>;

/** The sessions agents reported lately, as the Agents page shows them. Read `sessions` and `loaded` inside a reactive scope. */
export interface AgentSessionFeed {
  readonly sessions: AgentSessions;
  /** False until the sessions have been read once, so a failed first read shows as a notice rather than as an empty page. */
  readonly loaded: boolean;
  /** Follows Mission Control's live events until the returned function is called. */
  start(): () => void;
}

/** Keeps the sessions current from `agent.session.updated`, and reads them again whenever the connection opens so rows missed in between don't leave it stale. */
export class LiveAgentSessions implements AgentSessionFeed {
  private readonly stream: LiveEventStream;
  private readonly reads: AgentSessionReads;
  private readonly changed = new Set<() => void>();
  private readonly track = createSubscriber((update) => {
    this.changed.add(update);
    return () => {
      this.changed.delete(update);
    };
  });
  private held: AgentSessions;
  private read: boolean;
  private readonly collectors = new Set<AgentSessionState[]>();
  private latestResync = 0;
  private adoptedResync = 0;

  constructor(props: LiveAgentSessionsProps) {
    const valid = liveAgentSessionsPropsSchema.parse(props);
    this.stream = valid.stream;
    this.reads = valid.reads;
    this.held = AgentSessions.of(valid.initial);
    this.read = valid.loaded;
  }

  get sessions(): AgentSessions {
    this.track();
    return this.held;
  }

  get loaded(): boolean {
    this.track();
    return this.read;
  }

  /** How many live events are held for reads still in flight; zero whenever no read is. */
  get retainedEvents(): number {
    let total = 0;
    for (const collector of this.collectors) total += collector.length;
    return total;
  }

  start(): () => void {
    return this.stream.subscribe({
      definition: AgentSessionLiveEvents.UPDATED,
      onEvent: (state) => {
        for (const collector of this.collectors) collector.push(state);
        this.held = this.held.applyUpdate(state);
        this.notify();
      },
      onOpen: () => void this.resync(),
    });
  }

  private notify(): void {
    for (const update of this.changed) update();
  }

  /** An event that lands while the read is in flight makes the read stale, so it goes again. When every read is interrupted, the last snapshot is adopted with the events that landed during it replayed on top. A read that fails leaves the sessions as they are. A read is dropped only once a newer resync has been adopted, so it can't replace fresher sessions. */
  private async resync(): Promise<void> {
    this.latestResync += 1;
    const generation = this.latestResync;
    const arrived: AgentSessionState[] = [];
    this.collectors.add(arrived);
    try {
      for (let attempt = 0; attempt < maxResyncAttempts; attempt += 1) {
        arrived.length = 0;
        const sessions = await this.reads.list();
        const interrupted = arrived.length > 0;
        if (generation < this.adoptedResync) return;
        if (interrupted && attempt < maxResyncAttempts - 1) continue;

        this.held = arrived.reduce(
          (held, state) => held.applyUpdate(state),
          AgentSessions.of(sessions),
        );
        this.adoptedResync = generation;
        this.read = true;
        this.notify();
        return;
      }
    } catch {
      return;
    } finally {
      this.collectors.delete(arrived);
    }
  }
}
