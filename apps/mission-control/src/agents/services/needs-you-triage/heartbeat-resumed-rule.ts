import type {
  NeedsYouDecision,
  NeedsYouTriageRule,
} from '#src/agents/services/needs-you-triage/needs-you-triage-rule.ts';

/** A heartbeat from any row of a session shows it is responding again, which resolves the session's "stopped responding" item. */
export class HeartbeatResumedRule implements NeedsYouTriageRule {
  decide(): NeedsYouDecision | null {
    return { action: 'resolve', scope: 'stopped' };
  }
}
