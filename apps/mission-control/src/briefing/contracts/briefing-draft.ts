import type {
  BriefingAgentDraft,
  BriefingBenchDraft,
  BriefingConnectionDraft,
  BriefingIssueDraft,
  BriefingObjectiveDraft,
  BriefingPullRequestDraft,
  BriefingRunDraft,
  BriefingSinceLastBriefingDraft,
} from '#src/briefing/contracts/briefing-snapshot.ts';

/** An initiative with the epics kept under it. */
export interface BriefingInitiativeDraft {
  initiative: BriefingObjectiveDraft;
  epics: BriefingObjectiveDraft[];
}

/** A snapshot's sections as the trimming works on them: capped, in priority order, and not yet given refs. */
export interface BriefingDraft {
  sinceLastBriefing: BriefingSinceLastBriefingDraft;
  initiatives: BriefingInitiativeDraft[];
  reviewRequests: BriefingPullRequestDraft[];
  myPullRequests: BriefingPullRequestDraft[];
  failedRuns: BriefingRunDraft[];
  assignedIssues: BriefingIssueDraft[];
  agents: BriefingAgentDraft[];
  benches: BriefingBenchDraft[];
  connections: BriefingConnectionDraft[];
}
