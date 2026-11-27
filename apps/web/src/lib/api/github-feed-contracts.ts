import { z } from 'zod';
import { linkSchema } from '#lib/api/github-account-contracts.ts';

const checkStateSchema = z.enum(['pending', 'success', 'failure']);

export const githubFeedConnectionSchema = z.object({
  id: z.string(),
  accountLogin: z.string(),
  kind: z.enum(['owned', 'guest']),
  lastSyncedAt: z.coerce
    .date()
    .nullable()
    .describe('Null until Mission Control first reads the connection.'),
  lastError: z
    .string()
    .nullable()
    .describe(
      'Why the latest read failed. The items are then from the last good read.',
    ),
});

const feedItemSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  repository: z.object({ fullName: z.string(), url: linkSchema }),
  url: linkSchema,
  updatedAt: z.coerce.date(),
});

export const githubFeedPullRequestSchema = feedItemSchema.extend({
  number: z.number().int(),
  title: z.string(),
  author: z.string().nullable(),
  state: z.enum(['open', 'closed', 'merged']),
  draft: z.boolean(),
  mergeable: z.enum(['mergeable', 'conflicting', 'unknown']),
  reviewDecision: z
    .enum(['approved', 'changes_requested', 'review_required'])
    .nullable(),
  headSha: z.string(),
  requestedReviewers: z.array(
    z.object({ kind: z.enum(['user', 'team']), name: z.string() }),
  ),
  checks: z
    .object({
      state: checkStateSchema,
      success: z.number().int(),
      failure: z.number().int(),
      pending: z.number().int(),
    })
    .nullable(),
});

export const githubFeedRunSchema = feedItemSchema.extend({
  workflowName: z.string(),
  runNumber: z.number().int(),
  branch: z.string(),
  headSha: z.string(),
  event: z.string(),
  conclusion: z.enum(['failure', 'timed_out', 'startup_failure']),
  pullRequestId: z.string().nullable(),
});

export const githubFeedIssueSchema = feedItemSchema.extend({
  number: z.number().int(),
  title: z.string(),
  author: z.string().nullable(),
  assignees: z.array(z.string()),
});

/** `GET /integrations/github/feed` on Mission Control. */
export const githubFeedSchema = z.object({
  connections: z.array(githubFeedConnectionSchema),
  reviewRequests: z.array(githubFeedPullRequestSchema),
  myPullRequests: z.array(githubFeedPullRequestSchema),
  failedRuns: z.array(githubFeedRunSchema),
  assignedIssues: z.array(githubFeedIssueSchema),
});

export type GithubFeed = z.infer<typeof githubFeedSchema>;
export type GithubFeedConnection = z.infer<typeof githubFeedConnectionSchema>;
export type GithubFeedPullRequest = z.infer<typeof githubFeedPullRequestSchema>;
export type GithubFeedRun = z.infer<typeof githubFeedRunSchema>;
export type GithubFeedIssue = z.infer<typeof githubFeedIssueSchema>;
