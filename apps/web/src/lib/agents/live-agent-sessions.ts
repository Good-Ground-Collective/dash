import { createSubscriber } from 'svelte/reactivity';
import { z } from 'zod';
import type { AgentSession } from '#lib/agents/agent-session-contracts.ts';
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
  private changes = 0;

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

  start(): () => void {
    return this.stream.subscribe({
      definition: AgentSessionLiveEvents.UPDATED,
      onEvent: (state) => {
        this.changes += 1;
        this.held = this.held.applyUpdate(state);
        this.notify();
      },
      onOpen: () => void this.resync(),
    });
  }

  private notify(): void {
    for (const update of this.changed) update();
  }

  /** An event that lands while the read is in flight makes the read stale, so it goes again. A read that fails leaves the sessions as they are. */
  private async resync(): Promise<void> {
    for (let attempt = 0; attempt < maxResyncAttempts; attempt += 1) {
      const before = this.changes;
      try {
        const sessions = await this.reads.list();
        if (this.changes === before) {
          this.held = AgentSessions.of(sessions);
          this.read = true;
          this.notify();
          return;
        }
      } catch {
        return;
      }
    }
  }
}
