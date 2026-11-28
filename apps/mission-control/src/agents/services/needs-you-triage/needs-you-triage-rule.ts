import type { AgentHeartbeatQuestion } from '#src/agents/contracts/agent-heartbeat.ts';
import type { AgentSessionState } from '#src/agents/contracts/agent-session.ts';

/** What a rule wants done to Needs you for the session state it was shown. */
export type NeedsYouDecision =
  | { action: 'open'; question: AgentHeartbeatQuestion | null }
  | { action: 'resolve'; scope: 'row' | 'session' };

export interface NeedsYouTriageRule {
  /** Looks at the state a heartbeat just moved forward, and answers what to open or resolve, or `null` to leave Needs you alone. Rules are plain code: no model decides. */
  decide(state: AgentSessionState): NeedsYouDecision | null;
}
