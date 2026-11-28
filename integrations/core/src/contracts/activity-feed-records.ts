import { z } from 'zod';

import { externalRecordSchema } from '#src/contracts/external-record.ts';
import { checkStateSchema } from '#src/contracts/source-control-records.ts';

const timestampSchema = z.iso.datetime({ offset: true });

const handleSchema = z
  .string()
  .min(1)
  .describe('The account handle as the provider shows it.');

export const activityQuerySchema = z.object({
  installationId: z.string().min(1),
  account: z.object({
    login: handleSchema,
    kind: z.enum(['organization', 'user']),
  }),
  viewerLogin: handleSchema.describe(
    'The person the activity is for: whose reviews are requested, who authored, who is assigned.',
  ),
  repositories: z
    .array(z.string().min(1))
    .describe(
      'Full names of the repositories whose default branch to check for failed runs and whose releases to read. Providers read at most their cap, after the repositories the viewer’s own work is in.',
    ),
  since: timestampSchema.describe(
    'The oldest merge or release worth reading. Pull requests merged and releases published before it are left out.',
  ),
});

export const activityRepositorySchema = externalRecordSchema.extend({
  fullName: z.string().min(1),
  defaultBranch: z
    .string()
    .min(1)
    .nullable()
    .describe('Null for an empty repository.'),
  archived: z.boolean(),
});

export const activityChecksSchema = z.object({
  state: checkStateSchema,
  success: z.int().nonnegative(),
  failure: z.int().nonnegative(),
  pending: z.int().nonnegative(),
});

export const activityReviewerSchema = z.object({
  kind: z.enum(['user', 'team']),
  name: handleSchema,
});

export const activityMergeStateSchema = z.enum([
  'clean',
  'blocked',
  'behind',
  'unstable',
  'dirty',
  'draft',
  'has_hooks',
  'unknown',
]);

export const activityPullRequestSchema = externalRecordSchema.extend({
  repositoryId: z.string().min(1),
  number: z.int().positive(),
  title: z.string(),
  author: handleSchema.nullable().describe('Null for a deleted account.'),
  state: z.enum(['open', 'closed', 'merged']),
  draft: z.boolean(),
  mergeable: z.enum(['mergeable', 'conflicting', 'unknown']),
  mergeState: activityMergeStateSchema
    .nullable()
    .describe('Null when the provider has not computed it.'),
  reviewDecision: z
    .enum(['approved', 'changes_requested', 'review_required'])
    .nullable(),
  headRef: z.string().min(1),
  headSha: z.string().min(1),
  requestedReviewers: z.array(activityReviewerSchema),
  checks: activityChecksSchema
    .nullable()
    .describe('Null when the head commit has no checks.'),
  mergedAt: timestampSchema
    .nullable()
    .describe('When the pull request was merged. Null while it is not merged.'),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const activityReleaseSchema = externalRecordSchema.extend({
  repositoryId: z.string().min(1),
  tagName: z.string().min(1),
  name: z
    .string()
    .min(1)
    .nullable()
    .describe('Null when the release has no title of its own.'),
  author: handleSchema.nullable().describe('Null for a deleted account.'),
  prerelease: z.boolean(),
  publishedAt: timestampSchema,
});

export const activityRunSchema = externalRecordSchema.extend({
  repositoryId: z.string().min(1),
  pullRequestId: z
    .string()
    .min(1)
    .nullable()
    .describe(
      'The viewer’s pull request whose head it ran on, or null on the default branch.',
    ),
  workflowName: z.string().min(1),
  runNumber: z.int().positive(),
  branch: z.string().min(1),
  headSha: z.string().min(1),
  event: z.string().min(1),
  conclusion: z.enum(['failure', 'timed_out', 'startup_failure']),
  updatedAt: timestampSchema,
});

export const activityIssueSchema = externalRecordSchema.extend({
  repositoryId: z.string().min(1),
  number: z.int().positive(),
  title: z.string(),
  author: handleSchema.nullable(),
  assignees: z.array(handleSchema),
  updatedAt: timestampSchema,
});

export const activityReleaseReadSchema = z.object({
  repositoryId: z.string().min(1),
  exhaustive: z
    .boolean()
    .describe(
      'True when the read returned fewer releases than it asked for, so it saw every release the repository has.',
    ),
  oldestPublishedAt: timestampSchema
    .nullable()
    .describe(
      'The oldest publish time among the published releases the read returned, whether or not they fall in the window. Null when it returned none.',
    ),
});

/** What one installation shows of a person's work. Every list is capped, so a busy account reads in a bounded number of calls. */
export const activitySchema = z.object({
  repositories: z.array(activityRepositorySchema),
  reviewRequests: z
    .array(activityPullRequestSchema)
    .describe(
      'Open pull requests waiting on the viewer’s review, directly or through a team.',
    ),
  authoredPullRequests: z.array(activityPullRequestSchema),
  mergedPullRequests: z
    .array(activityPullRequestSchema)
    .describe(
      'Pull requests the viewer authored that were merged since the query’s `since`.',
    ),
  releases: z
    .array(activityReleaseSchema)
    .describe(
      'Published releases of the repositories read, since the query’s `since`. Drafts are never read.',
    ),
  releaseReads: z
    .array(activityReleaseReadSchema)
    .describe(
      'The repositories whose releases were read, and how far back the read could see. A release of one of them that `releases` leaves out and that is not older than that was deleted or unpublished.',
    ),
  failedRuns: z
    .array(activityRunSchema)
    .describe(
      'The latest run of each workflow that failed on a default branch head or on the head of one of the viewer’s open pull requests.',
    ),
  assignedIssues: z.array(activityIssueSchema),
  truncated: z.boolean().describe('True when a cap cut a list short.'),
});

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type ActivityRepository = z.infer<typeof activityRepositorySchema>;
export type ActivityChecks = z.infer<typeof activityChecksSchema>;
export type ActivityReviewer = z.infer<typeof activityReviewerSchema>;
export type ActivityPullRequest = z.infer<typeof activityPullRequestSchema>;
export type ActivityRelease = z.infer<typeof activityReleaseSchema>;
export type ActivityReleaseRead = z.infer<typeof activityReleaseReadSchema>;
export type ActivityRun = z.infer<typeof activityRunSchema>;
export type ActivityIssue = z.infer<typeof activityIssueSchema>;
export type Activity = z.infer<typeof activitySchema>;
