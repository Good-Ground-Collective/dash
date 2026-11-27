import { checkStateSchema } from '@dash/integrations-core';
import { z } from 'zod';

const nodeIdSchema = z
  .string()
  .min(1)
  .describe('GitHub’s GraphQL node id, stable across renames and transfers.');
const timestampSchema = z.iso.datetime({ offset: true });

export const connectionKindSchema = z.enum(['owned', 'guest']);

export const pullRequestStateSchema = z.enum(['open', 'closed', 'merged']);

export const mergeabilitySchema = z.enum([
  'mergeable',
  'conflicting',
  'unknown',
]);

export const reviewDecisionSchema = z.enum([
  'approved',
  'changes_requested',
  'review_required',
]);

export const runConclusionSchema = z.enum([
  'failure',
  'timed_out',
  'startup_failure',
]);

export const githubRepositoryRecordSchema = z.object({
  nodeId: nodeIdSchema,
  fullName: z.string().min(1),
  url: z.url(),
  defaultBranch: z.string().min(1).nullable(),
  archived: z.boolean(),
});

export const githubPullRequestRecordSchema = z.object({
  nodeId: nodeIdSchema,
  repositoryNodeId: nodeIdSchema,
  number: z.int().positive(),
  title: z.string(),
  url: z.url(),
  state: pullRequestStateSchema,
  draft: z.boolean(),
  mergeable: mergeabilitySchema,
  reviewDecision: reviewDecisionSchema.nullable(),
  author: z.string().min(1).nullable(),
  headRef: z.string().min(1),
  headSha: z.string().min(1),
  updatedAt: timestampSchema,
});

export const githubReviewRequestRecordSchema = z.object({
  pullRequestNodeId: nodeIdSchema,
  reviewerKind: z.enum(['user', 'team']),
  reviewer: z.string().min(1),
});

export const githubCheckRollupRecordSchema = z.object({
  pullRequestNodeId: nodeIdSchema,
  headSha: z.string().min(1),
  state: checkStateSchema,
  successCount: z.int().nonnegative(),
  failureCount: z.int().nonnegative(),
  pendingCount: z.int().nonnegative(),
});

export const githubWorkflowRunRecordSchema = z.object({
  nodeId: nodeIdSchema,
  repositoryNodeId: nodeIdSchema,
  pullRequestNodeId: nodeIdSchema.nullable(),
  workflowName: z.string().min(1),
  runNumber: z.int().positive(),
  branch: z.string().min(1),
  headSha: z.string().min(1),
  event: z.string().min(1),
  conclusion: runConclusionSchema,
  url: z.url(),
  updatedAt: timestampSchema,
});

export const githubIssueRecordSchema = z.object({
  nodeId: nodeIdSchema,
  repositoryNodeId: nodeIdSchema,
  number: z.int().positive(),
  title: z.string(),
  url: z.url(),
  author: z.string().min(1).nullable(),
  updatedAt: timestampSchema,
});

/** Who a pull request or issue is waiting on: a requested reviewer, or an issue assignee. */
export const githubAssignmentRecordSchema = z.object({
  subjectNodeId: nodeIdSchema,
  subjectKind: z.enum(['pull_request', 'issue']),
  login: z.string().min(1),
  role: z.enum(['review_requested', 'assignee']),
});

/** Everything one read of a connection found, in the shape of its tables. A later read replaces it whole. */
export const githubRecordsSchema = z.object({
  repositories: z.array(githubRepositoryRecordSchema),
  pullRequests: z.array(githubPullRequestRecordSchema),
  reviewRequests: z.array(githubReviewRequestRecordSchema),
  checkRollups: z.array(githubCheckRollupRecordSchema),
  workflowRuns: z.array(githubWorkflowRunRecordSchema),
  issues: z.array(githubIssueRecordSchema),
  assignments: z.array(githubAssignmentRecordSchema),
});

export type ConnectionKind = z.infer<typeof connectionKindSchema>;
export type GithubRepositoryRecord = z.infer<
  typeof githubRepositoryRecordSchema
>;
export type GithubPullRequestRecord = z.infer<
  typeof githubPullRequestRecordSchema
>;
export type GithubReviewRequestRecord = z.infer<
  typeof githubReviewRequestRecordSchema
>;
export type GithubCheckRollupRecord = z.infer<
  typeof githubCheckRollupRecordSchema
>;
export type GithubWorkflowRunRecord = z.infer<
  typeof githubWorkflowRunRecordSchema
>;
export type GithubIssueRecord = z.infer<typeof githubIssueRecordSchema>;
export type GithubAssignmentRecord = z.infer<
  typeof githubAssignmentRecordSchema
>;
export type GithubRecords = z.infer<typeof githubRecordsSchema>;
