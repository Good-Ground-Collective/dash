import { z } from 'zod';

import {
  agentLostAfterMinutes,
  agentStaleAfterMinutes,
} from '#src/agents/definitions/agent-liveness/agent-liveness.ts';
import type { AgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';

const minuteMilliseconds = 60 * 1000;

const publishingAgentSessionWatchdogPropsSchema = z.object({
  repository: z.custom<Pick<AgentSessionRepository, 'markSilent'>>(),
  liveEvents: z.custom<LiveEvents>(),
});

export interface AgentSessionWatchdog {
  /** Marks working sessions and subagents that have gone silent as of `now`, publishes each change, and answers how many changed. */
  sweep(props: { now: Date }): Promise<number>;
}

/** A working agent silent for 10 minutes is `stale`, and for 30 is `lost`. Publishes `agent.session.updated` for each row it marks. */
export class PublishingAgentSessionWatchdog implements AgentSessionWatchdog {
  private readonly repository: Pick<AgentSessionRepository, 'markSilent'>;
  private readonly liveEvents: LiveEvents;

  constructor(
    props: z.input<typeof publishingAgentSessionWatchdogPropsSchema>,
  ) {
    const parsed = publishingAgentSessionWatchdogPropsSchema.parse(props);
    this.repository = parsed.repository;
    this.liveEvents = parsed.liveEvents;
  }

  async sweep(props: { now: Date }): Promise<number> {
    const marked = await this.repository.markSilent({
      staleBefore: PublishingAgentSessionWatchdog.minutesBefore({
        now: props.now,
        minutes: agentStaleAfterMinutes,
      }),
      lostBefore: PublishingAgentSessionWatchdog.minutesBefore({
        now: props.now,
        minutes: agentLostAfterMinutes,
      }),
    });

    for (const session of marked) {
      this.liveEvents.publish({
        type: 'agent.session.updated',
        data: z.json().parse(session),
      });
    }
    return marked.length;
  }

  private static minutesBefore(props: { now: Date; minutes: number }): Date {
    return new Date(props.now.getTime() - props.minutes * minuteMilliseconds);
  }
}
