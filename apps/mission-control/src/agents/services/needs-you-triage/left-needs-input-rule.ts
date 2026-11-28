import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import type {
  NeedsYouDecision,
  NeedsYouTriageRule,
} from '#src/agents/services/needs-you-triage/needs-you-triage-rule.ts';

/** A heartbeat that is no longer asking for input resolves that session or subagent's item. */
export class LeftNeedsInputRule implements NeedsYouTriageRule {
  decide(state: AgentSessionState): NeedsYouDecision | null {
    return state.status === 'question'
      ? null
      : { action: 'resolve', scope: 'row' };
  }
}
