import { checkStateSchema } from '@dash/integrations-core';
import { z } from 'zod';

import {
  connectionKindSchema,
  mergeabilitySchema,
  pullRequestStateSchema,
  reviewDecisionSchema,
  runConclusionSchema,
} from '#src/github-feed/contracts/github-records.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const githubFeedConnectionSchema = z.object({
  id: z.uuid(),
  accountLogin: z.string().min(1),
  kind: connectionKindSchema,
  lastSyncedAt: timestampSchema
    .nullable()
    .describe(
      'When Dash last read the connection in full. Null until the first read succeeds.',
    ),
  lastError: z
    .string()
    .nullable()
    .describe(
      'Why the latest read failed, or null when it succeeded. The items keep what the last good read found.',
    ),
});

const feedItemSchema = z.object({
  id: z.string().min(1).describe('GitHub’s node id.'),
  connectionId: z.uuid().describe('The connection the item was read through.'),
  repository: z.object({ fullName: z.string().min(1), url: z.url() }),
  url: z.url().describe('Opens the item on GitHub.'),
  updatedAt: timestampSchema,
});

export const githubFeedPullRequestSchema = feedItemSchema.extend({
  number: z.int().positive(),
  title: z.string(),
  author: z.string().min(1).nullable(),
  state: pullRequestStateSchema,
  draft: z.boolean(),
  mergeable: mergeabilitySchema,
  reviewDecision: reviewDecisionSchema
    .nullable()
    .describe('Null when the repository requires no review.'),
  headSha: z.string().min(1),
  requestedReviewers: z.array(
    z.object({ kind: z.enum(['user', 'team']), name: z.string().min(1) }),
  ),
  checks: z
    .object({
      state: checkStateSchema,
      success: z.int().nonnegative(),
      failure: z.int().nonnegative(),
      pending: z.int().nonnegative(),
    })
    .nullable()
    .describe('The head commit’s checks and statuses. Null when it has none.'),
});

export const githubFeedRunSchema = feedItemSchema.extend({
  workflowName: z.string().min(1),
  runNumber: z.int().positive(),
  branch: z.string().min(1),
  headSha: z.string().min(1),
  event: z.string().min(1),
  conclusion: runConclusionSchema,
  pullRequestId: z
    .string()
    .min(1)
    .nullable()
    .describe('Your pull request it ran on, or null for a default branch.'),
});

export const githubFeedIssueSchema = feedItemSchema.extend({
  number: z.int().positive(),
  title: z.string(),
  author: z.string().min(1).nullable(),
  assignees: z.array(z.string().min(1)),
});

/** `GET /integrations/github/feed`: the signed-in person's GitHub work, newest first, the same shape whichever kind of connection read it. */
export const githubFeedSchema = z.object({
  connections: z.array(githubFeedConnectionSchema),
  reviewRequests: z
    .array(githubFeedPullRequestSchema)
    .describe(
      'Open pull requests waiting on your review, directly or through a team.',
    ),
  myPullRequests: z.array(githubFeedPullRequestSchema),
  failedRuns: z
    .array(githubFeedRunSchema)
    .describe(
      'Workflow runs that failed on a default branch head or on the head of one of your open pull requests.',
    ),
  assignedIssues: z.array(githubFeedIssueSchema),
});

export type GithubFeed = z.infer<typeof githubFeedSchema>;
export type GithubFeedConnection = z.infer<typeof githubFeedConnectionSchema>;
export type GithubFeedPullRequest = z.infer<typeof githubFeedPullRequestSchema>;
export type GithubFeedRun = z.infer<typeof githubFeedRunSchema>;
export type GithubFeedIssue = z.infer<typeof githubFeedIssueSchema>;
