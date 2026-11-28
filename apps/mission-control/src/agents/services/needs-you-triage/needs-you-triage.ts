import { z } from 'zod';

import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import type { NeedsYouItem } from '#src/agents/contracts/needs-you-item.ts';
import type { NeedsYouItemRepository } from '#src/agents/repositories/needs-you-items/needs-you-item-repository.ts';
import type { NeedsYouDecision } from '#src/agents/services/needs-you-triage/needs-you-triage-rule.ts';
import { needsYouTriageRules } from '#src/agents/services/needs-you-triage/needs-you-triage-rules.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';

const rulesNeedsYouTriagePropsSchema = z.object({
  repository: z.custom<NeedsYouItemRepository>(),
  liveEvents: z.custom<LiveEvents>(),
});

export interface NeedsYouTriage {
  /** Runs every rule over the state a heartbeat moved forward, opens and resolves items to match, and publishes `needs-you.opened` and `needs-you.resolved` for each. */
  triage(state: AgentSessionState): Promise<void>;
}

export class RulesNeedsYouTriage implements NeedsYouTriage {
  private readonly repository: NeedsYouItemRepository;
  private readonly liveEvents: LiveEvents;

  constructor(props: z.input<typeof rulesNeedsYouTriagePropsSchema>) {
    const parsed = rulesNeedsYouTriagePropsSchema.parse(props);
    this.repository = parsed.repository;
    this.liveEvents = parsed.liveEvents;
  }

  async triage(state: AgentSessionState): Promise<void> {
    for (const rule of needsYouTriageRules) {
      const decision = rule.decide(state);
      if (decision !== null) {
        await this.apply({ state, decision });
      }
    }
  }

  private async apply(props: {
    state: AgentSessionState;
    decision: NeedsYouDecision;
  }): Promise<void> {
    const { state, decision } = props;

    if (decision.action === 'open') {
      const opened = await this.repository.open({
        reportedBy: state.reportedBy,
        sessionId: state.sessionId,
        agentId: state.agentId,
        question: decision.question,
      });
      if (opened !== null) {
        this.publish('needs-you.opened', opened);
      }
      return;
    }

    const resolved =
      decision.scope === 'session'
        ? await this.repository.resolveSession(state)
        : await this.repository.resolveOne(state);
    for (const item of resolved) {
      this.publish('needs-you.resolved', item);
    }
  }

  private publish(
    type: 'needs-you.opened' | 'needs-you.resolved',
    item: NeedsYouItem,
  ): void {
    this.liveEvents.publish({ type, data: z.json().parse(item) });
  }
}
