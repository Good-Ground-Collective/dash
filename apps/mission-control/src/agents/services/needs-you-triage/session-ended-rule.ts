import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import type {
  NeedsYouDecision,
  NeedsYouTriageRule,
} from '#src/agents/services/needs-you-triage/needs-you-triage-rule.ts';

const endingStatuses: readonly string[] = ['complete', 'failed', 'error'];

/** When the session itself finishes, nothing under it is still waiting on a person, subagents included. */
export class SessionEndedRule implements NeedsYouTriageRule {
  decide(state: AgentSessionState): NeedsYouDecision | null {
    return state.agentId === null && endingStatuses.includes(state.status)
      ? { action: 'resolve', scope: 'session' }
      : null;
  }
}
