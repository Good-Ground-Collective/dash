import {
  activityCheckStateSchema,
  activityIssueReferenceSchema,
  activityMergeStateSchema,
  checkStateSchema,
  webUrlSchema,
} from '@dash/integrations-core';
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

export const mergeStateSchema = activityMergeStateSchema;

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
  defaultBranchHeadSha: z
    .string()
    .min(1)
    .nullable()
    .describe(
      'The default branch head the latest read saw. Null when none was read.',
    ),
  defaultBranchState: checkStateSchema
    .nullable()
    .describe(
      'How the default branch head’s checks add up. Null when the head has no checks, when the read could not see them, or when no head was read.',
    ),
  defaultBranchChecksTruncated: z
    .boolean()
    .describe(
      'True when the default branch head has more checks than the latest read could name. False when none was read.',
    ),
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
  mergeState: mergeStateSchema.nullable(),
  reviewDecision: reviewDecisionSchema.nullable(),
  author: z.string().min(1).nullable(),
  headRef: z.string().min(1),
  headSha: z.string().min(1),
  closingIssues: z
    .array(activityIssueReferenceSchema)
    .describe(
      'The issues the pull request closes. Empty for a pull request read without them.',
    ),
  mergedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const githubReleaseRecordSchema = z.object({
  nodeId: nodeIdSchema,
  repositoryNodeId: nodeIdSchema,
  tagName: z.string().min(1),
  name: z.string().min(1).nullable(),
  url: z.url(),
  author: z.string().min(1).nullable(),
  prerelease: z.boolean(),
  publishedAt: timestampSchema,
});

/** How far one read of a repository's releases could see, which decides what a release it no longer reports means. */
export const githubReleaseReadSchema = z.object({
  repositoryNodeId: nodeIdSchema,
  exhaustive: z
    .boolean()
    .describe(
      'True when the read returned fewer releases than it asked for, so it saw every release the repository has.',
    ),
  oldestPublishedAt: timestampSchema
    .nullable()
    .describe(
      'The oldest publish time among the releases the read returned. Null when it returned none.',
    ),
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

export const githubCheckRecordSchema = z.object({
  subjectNodeId: nodeIdSchema.describe(
    'The repository whose default branch, or the pull request, the check ran on.',
  ),
  subjectKind: z.enum(['default_branch', 'pull_request']),
  name: z.string().min(1),
  headSha: z.string().min(1),
  kind: z.enum(['check_run', 'status']),
  app: z.string().min(1).nullable(),
  state: activityCheckStateSchema,
  url: webUrlSchema.nullable(),
  failingSince: timestampSchema
    .nullable()
    .describe(
      'When the check began failing, kept only across consecutive failing reads; a non-failing read clears it. A read leaves it null; the stored row decides it.',
    ),
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

/** Everything one read of a connection found, in the shape of its tables. A later read replaces it, except the merged pull requests and releases still within their retention. */
export const githubRecordsSchema = z.object({
  repositories: z.array(githubRepositoryRecordSchema),
  pullRequests: z.array(githubPullRequestRecordSchema),
  releases: z.array(githubReleaseRecordSchema),
  reviewRequests: z.array(githubReviewRequestRecordSchema),
  checkRollups: z.array(githubCheckRollupRecordSchema),
  checks: z.array(githubCheckRecordSchema),
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
export type GithubReleaseRecord = z.infer<typeof githubReleaseRecordSchema>;
export type GithubReleaseRead = z.infer<typeof githubReleaseReadSchema>;
export type GithubReviewRequestRecord = z.infer<
  typeof githubReviewRequestRecordSchema
>;
export type GithubCheckRollupRecord = z.infer<
  typeof githubCheckRollupRecordSchema
>;
export type GithubCheckRecord = z.infer<typeof githubCheckRecordSchema>;
export type GithubWorkflowRunRecord = z.infer<
  typeof githubWorkflowRunRecordSchema
>;
export type GithubIssueRecord = z.infer<typeof githubIssueRecordSchema>;
export type GithubAssignmentRecord = z.infer<
  typeof githubAssignmentRecordSchema
>;
export type GithubRecords = z.infer<typeof githubRecordsSchema>;
