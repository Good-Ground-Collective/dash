import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';
import type {
  NeedsYouDecision,
  NeedsYouTriageRule,
} from '#src/agents/services/needs-you-triage/needs-you-triage-rule.ts';

/** A session or subagent that needs input opens an item carrying its question verbatim. */
export class NeedsInputRule implements NeedsYouTriageRule {
  decide(state: AgentSessionState): NeedsYouDecision | null {
    return state.status === 'question'
      ? { action: 'open', question: state.question }
      : null;
  }
}
