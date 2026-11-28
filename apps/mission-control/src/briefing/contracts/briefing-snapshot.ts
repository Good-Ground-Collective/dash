import {
  checkStateSchema,
  prioritySchema,
  ticketActivityKindSchema,
} from '@dash/integrations-core';
import { z } from 'zod';

import { agentHeartbeatStatusSchema } from '#src/agents/contracts/agent-heartbeat.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import {
  mergeabilitySchema,
  reviewDecisionSchema,
  runConclusionSchema,
} from '#src/github-feed/contracts/github-records.ts';
import {
  objectiveHintSchema,
  objectiveProgressSchema,
  objectiveStatusSchema,
} from '#src/objectives/contracts/objectives.ts';

const timestampSchema = z.iso.datetime({ offset: true });
const refSchema = z
  .string()
  .min(2)
  .max(8)
  .describe(
    'A short id the writer cites. Unique within the snapshot, assigned after trimming.',
  );
const titleSchema = z.string().max(briefingLimits.titleLength);
const textSchema = z.string().max(briefingLimits.textLength);
const nameSchema = z.string().max(briefingLimits.nameLength);
const urlSchema = z.url().max(2000);
const repositorySchema = nameSchema.describe('The repository’s full name.');
const withRef = { ref: refSchema };

const objectiveDraftSchema = z.object({
  kind: z.enum(['initiative', 'epic']),
  title: titleSchema,
  url: urlSchema,
  status: objectiveStatusSchema,
  priority: prioritySchema.nullable(),
  dueDate: z.iso.date().nullable(),
  progress: objectiveProgressSchema,
  lastActivityAt: timestampSchema,
  hints: z.array(objectiveHintSchema),
  dueAfterInitiative: z
    .boolean()
    .describe(
      'True for an epic due after its initiative. Never true for an initiative.',
    ),
  latestUpdate: z
    .object({
      kind: ticketActivityKindSchema,
      occurredAt: timestampSchema,
      actor: nameSchema.nullable(),
      url: urlSchema,
      ticketTitle: titleSchema,
    })
    .nullable(),
  nextTicket: z.object({ title: titleSchema, url: urlSchema }).nullable(),
});

const objectiveSchema = objectiveDraftSchema.extend({
  ...withRef,
  initiativeRef: refSchema
    .nullable()
    .describe('The initiative an epic sits under. `null` for an initiative.'),
});

const pullRequestDraftSchema = z.object({
  url: urlSchema,
  repository: repositorySchema,
  number: z.int().positive(),
  title: titleSchema,
  author: nameSchema.nullable(),
  draft: z.boolean(),
  reviewDecision: reviewDecisionSchema.nullable(),
  mergeable: mergeabilitySchema,
  checks: z
    .object({ state: checkStateSchema, failure: z.int().nonnegative() })
    .nullable(),
  updatedAt: timestampSchema,
});

const runDraftSchema = z.object({
  url: urlSchema,
  repository: repositorySchema,
  workflowName: nameSchema,
  runNumber: z.int().positive(),
  branch: nameSchema,
  event: nameSchema,
  conclusion: runConclusionSchema,
  updatedAt: timestampSchema,
});

const issueDraftSchema = z.object({
  url: urlSchema,
  repository: repositorySchema,
  number: z.int().positive(),
  title: titleSchema,
  author: nameSchema.nullable(),
  updatedAt: timestampSchema,
});

const agentDraftSchema = z.object({
  agentName: nameSchema.describe('The name the session reported as.'),
  harness: nameSchema,
  benchId: nameSchema.nullable(),
  status: agentHeartbeatStatusSchema,
  summary: textSchema.nullable(),
  question: textSchema
    .nullable()
    .describe('The open question’s text, without its options.'),
  error: z.object({ kind: nameSchema, message: textSchema }).nullable(),
  repository: nameSchema.nullable(),
  branch: nameSchema.nullable(),
  subagents: z.int().nonnegative(),
  lastHeartbeatAt: timestampSchema,
});

const benchDraftSchema = z.object({
  benchId: nameSchema,
  description: textSchema.nullable(),
  lastHeartbeatAt: timestampSchema
    .nullable()
    .describe(
      'The latest activity reported through the bench’s key in the last 24 hours, or `null` when there is none.',
    ),
});

const connectionDraftSchema = z.object({
  source: z.enum(['objectives', 'github']),
  accountLogin: nameSchema,
  lastSyncedAt: timestampSchema.nullable(),
  truncated: z.boolean().nullable(),
  lastError: textSchema.nullable(),
});

const githubItems = briefingLimits.githubItems;

export const briefingCountsSchema = z
  .object({
    objectives: z.int().nonnegative(),
    reviewRequests: z.int().nonnegative(),
    myPullRequests: z.int().nonnegative(),
    failedRuns: z.int().nonnegative(),
    assignedIssues: z.int().nonnegative(),
    agents: z.int().nonnegative(),
    benches: z.int().nonnegative(),
  })
  .describe(
    'What each source held before trimming, initiatives and epics together for objectives.',
  );

/** What the briefing writer is handed: Dash's stored data for one person at one moment, trimmed to fixed caps. Every item has a `ref` to cite. */
export const briefingSnapshotSchema = z.object({
  takenAt: timestampSchema,
  objectives: z
    .array(objectiveSchema)
    .max(briefingLimits.initiatives * (1 + briefingLimits.epicsPerInitiative))
    .describe('Initiatives, each followed by its epics, in priority order.'),
  github: z.object({
    reviewRequests: z
      .array(pullRequestDraftSchema.extend(withRef))
      .max(githubItems),
    myPullRequests: z
      .array(pullRequestDraftSchema.extend(withRef))
      .max(githubItems),
    failedRuns: z.array(runDraftSchema.extend(withRef)).max(githubItems),
    assignedIssues: z.array(issueDraftSchema.extend(withRef)).max(githubItems),
  }),
  agents: z
    .array(agentDraftSchema.extend(withRef))
    .max(briefingLimits.agents)
    .describe(
      'Sessions where anything reported in the last 24 hours, most recent first.',
    ),
  benches: z
    .array(benchDraftSchema.extend(withRef))
    .max(briefingLimits.benches),
  connections: z
    .array(connectionDraftSchema.extend(withRef))
    .max(briefingLimits.connections),
  counts: briefingCountsSchema,
});

export type BriefingSnapshotDigest = z.infer<typeof briefingSnapshotSchema>;
export type BriefingCounts = BriefingSnapshotDigest['counts'];
export type BriefingObjective = z.infer<typeof objectiveSchema>;
export type BriefingObjectiveDraft = z.infer<typeof objectiveDraftSchema>;
export type BriefingPullRequestDraft = z.infer<typeof pullRequestDraftSchema>;
export type BriefingRunDraft = z.infer<typeof runDraftSchema>;
export type BriefingIssueDraft = z.infer<typeof issueDraftSchema>;
export type BriefingAgentDraft = z.infer<typeof agentDraftSchema>;
export type BriefingBenchDraft = z.infer<typeof benchDraftSchema>;
export type BriefingConnectionDraft = z.infer<typeof connectionDraftSchema>;
