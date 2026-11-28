import { HeartbeatResumedRule } from '#src/agents/services/needs-you-triage/heartbeat-resumed-rule.ts';
import { LeftNeedsInputRule } from '#src/agents/services/needs-you-triage/left-needs-input-rule.ts';
import { NeedsInputRule } from '#src/agents/services/needs-you-triage/needs-input-rule.ts';
import type { NeedsYouTriageRule } from '#src/agents/services/needs-you-triage/needs-you-triage-rule.ts';
import { SessionEndedRule } from '#src/agents/services/needs-you-triage/session-ended-rule.ts';

/** Every rule that decides what needs a person, run in order. A session responding again resolves its stopped item first, so a question in the same heartbeat can open beside it. Adding a rule is adding an entry. */
export const needsYouTriageRules: readonly NeedsYouTriageRule[] = [
  new HeartbeatResumedRule(),
  new NeedsInputRule(),
  new LeftNeedsInputRule(),
  new SessionEndedRule(),
];
