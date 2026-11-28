import {
  activityCheckStateSchema,
  activityIssueReferenceSchema,
  checkStateSchema,
  webUrlSchema,
} from '@dash/integrations-core';
import { z } from 'zod';

import {
  connectionKindSchema,
  mergeabilitySchema,
  mergeStateSchema,
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
  truncated: z
    .boolean()
    .nullable()
    .describe(
      'True when the last good read hit a page or repository cap, so the items are partial. Null until the first read succeeds.',
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
  mergedAt: timestampSchema
    .nullable()
    .describe('When the pull request was merged. Null while it is not merged.'),
  createdAt: timestampSchema,
  number: z.int().positive(),
  title: z.string(),
  author: z.string().min(1).nullable(),
  state: pullRequestStateSchema,
  draft: z.boolean(),
  mergeable: mergeabilitySchema,
  mergeState: mergeStateSchema
    .nullable()
    .describe(
      'Null until the pull request is next read from GitHub; GitHub reports a state it is still computing as unknown.',
    ),
  reviewDecision: reviewDecisionSchema
    .nullable()
    .describe('Null when the repository requires no review.'),
  headSha: z.string().min(1),
  closingIssues: z
    .array(activityIssueReferenceSchema)
    .describe(
      'The issues the pull request closes, which Home uses to place a merge under its epic. Only recent merges name them; every other pull request lists none.',
    ),
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

export const githubFeedMyPullRequestSchema = githubFeedPullRequestSchema.extend(
  {
    failingChecks: z
      .array(
        z.object({
          name: z.string().min(1),
          url: webUrlSchema
            .nullable()
            .describe(
              'Where the provider shows the check. Null when it gives none.',
            ),
        }),
      )
      .describe(
        'The checks failing on the head commit, as many as the read could name.',
      ),
    checkCount: z
      .int()
      .nonnegative()
      .describe(
        'How many checks and statuses the head commit has, passing or not.',
      ),
  },
);

export const githubFeedCheckSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['check_run', 'status']),
  app: z
    .string()
    .min(1)
    .nullable()
    .describe('The app that reported a check run. Null for a commit status.'),
  state: activityCheckStateSchema,
  url: webUrlSchema
    .nullable()
    .describe('Where the provider shows the check. Null when it gives none.'),
  failingSince: timestampSchema
    .nullable()
    .describe(
      'When the check began failing, kept only across consecutive failing reads. A pending, success, neutral or skipped read clears it, so a later failure starts afresh. Null unless it is failing.',
    ),
});

export const githubFeedDefaultBranchSchema = z.object({
  repository: z.object({ fullName: z.string().min(1), url: z.url() }),
  branch: z.string().min(1),
  headSha: z.string().min(1),
  state: checkStateSchema
    .nullable()
    .describe(
      'How the head’s checks add up. Null when the head has no checks or GitHub refused to show them to Dash.',
    ),
  checksTruncated: z
    .boolean()
    .describe(
      'True when the head has more checks than Dash could name, so `checks` lists only some of them.',
    ),
  checks: z
    .array(githubFeedCheckSchema)
    .describe('Failing checks first, then by name.'),
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

export const githubFeedReleaseSchema = feedItemSchema
  .omit({ updatedAt: true })
  .extend({
    tagName: z.string().min(1),
    name: z
      .string()
      .min(1)
      .nullable()
      .describe('Null when the release has no title of its own.'),
    author: z.string().min(1).nullable(),
    prerelease: z.boolean(),
    publishedAt: timestampSchema,
    url: z.url().describe('Opens the release on GitHub.'),
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
  myPullRequests: z
    .array(githubFeedMyPullRequestSchema)
    .describe('Your open pull requests, with the checks failing on each.'),
  recentMerges: z
    .array(githubFeedPullRequestSchema)
    .describe(
      'Pull requests of yours merged within the last 48 hours, by merge time, newest first.',
    ),
  releases: z
    .array(githubFeedReleaseSchema)
    .describe(
      'Releases published within the last 48 hours on repositories Dash reads, by publish time, newest first.',
    ),
  failedRuns: z
    .array(githubFeedRunSchema)
    .describe(
      'Workflow runs that failed on a default branch head or on the head of one of your open pull requests.',
    ),
  defaultBranches: z
    .array(githubFeedDefaultBranchSchema)
    .describe(
      'The default branch of every repository Dash read the latest checks of, by repository name.',
    ),
  assignedIssues: z.array(githubFeedIssueSchema),
});

export type GithubFeed = z.infer<typeof githubFeedSchema>;
export type GithubFeedConnection = z.infer<typeof githubFeedConnectionSchema>;
export type GithubFeedPullRequest = z.infer<typeof githubFeedPullRequestSchema>;
export type GithubFeedMyPullRequest = z.infer<
  typeof githubFeedMyPullRequestSchema
>;
export type GithubFeedCheck = z.infer<typeof githubFeedCheckSchema>;
export type GithubFeedDefaultBranch = z.infer<
  typeof githubFeedDefaultBranchSchema
>;
export type GithubFeedRelease = z.infer<typeof githubFeedReleaseSchema>;
export type GithubFeedRun = z.infer<typeof githubFeedRunSchema>;
export type GithubFeedIssue = z.infer<typeof githubFeedIssueSchema>;
