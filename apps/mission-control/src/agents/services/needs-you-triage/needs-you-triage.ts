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
  /** Resolves every open item of the session whose own row the watchdog just marked lost, opens one `stopped_responding` item for it, and publishes `needs-you.resolved` for each resolved and `needs-you.opened` for the new one. */
  sessionLost(state: AgentSessionState): Promise<void>;
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

  async sessionLost(state: AgentSessionState): Promise<void> {
    await this.apply({
      state,
      decision: { action: 'resolve', scope: 'session' },
    });
    const opened = await this.repository.open({
      reportedBy: state.reportedBy,
      sessionId: state.sessionId,
      agentId: null,
      question: null,
      kind: 'stopped_responding',
    });
    if (opened !== null) {
      this.publish('needs-you.opened', opened);
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
        kind: 'needs_input',
      });
      if (opened !== null) {
        this.publish('needs-you.opened', opened);
      }
      return;
    }

    const resolved = await this.resolve({ state, scope: decision.scope });
    for (const item of resolved) {
      this.publish('needs-you.resolved', item);
    }
  }

  private async resolve(props: {
    state: AgentSessionState;
    scope: 'row' | 'session' | 'stopped';
  }): Promise<NeedsYouItem[]> {
    switch (props.scope) {
      case 'session':
        return this.repository.resolveSession(props.state);
      case 'stopped':
        return this.repository.resolveStopped(props.state);
      case 'row':
        return this.repository.resolveOne(props.state);
    }
  }

  private publish(
    type: 'needs-you.opened' | 'needs-you.resolved',
    item: NeedsYouItem,
  ): void {
    this.liveEvents.publish({ type, data: z.json().parse(item) });
  }
}
