import { z } from 'zod';
import { linkSchema } from '#lib/api/github-account-contracts.ts';

const checkStateSchema = z.enum(['pending', 'success', 'failure']);

const watchSourceSchema = z.enum(['rule', 'repo']);

const watchedStateSchema = z.enum(['failing', 'pending', 'passing', 'none']);

const checkOutcomeSchema = z.enum([
  'success',
  'failure',
  'pending',
  'neutral',
  'skipped',
]);

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
  truncated: z
    .boolean()
    .nullable()
    .describe(
      'True when the last good read hit a cap, so the items are partial. Null until the first read succeeds.',
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
  mergedAt: z.coerce
    .date()
    .nullable()
    .describe('When the pull request was merged. Null while it is not merged.'),
  createdAt: z.coerce.date(),
  number: z.number().int(),
  title: z.string(),
  author: z.string().nullable(),
  state: z.enum(['open', 'closed', 'merged']),
  draft: z.boolean(),
  mergeable: z.enum(['mergeable', 'conflicting', 'unknown']),
  mergeState: z
    .enum([
      'clean',
      'blocked',
      'behind',
      'unstable',
      'dirty',
      'draft',
      'has_hooks',
      'unknown',
    ])
    .nullable()
    .describe(
      'Null until the pull request is next read from GitHub; GitHub reports a state it is still computing as unknown.',
    ),
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

export const githubFeedMyPullRequestSchema = githubFeedPullRequestSchema.extend(
  {
    failingChecks: z
      .array(z.object({ name: z.string(), url: linkSchema.nullable() }))
      .describe(
        'The checks failing on the head commit, as many as Dash could name.',
      ),
    checkCount: z
      .number()
      .int()
      .describe(
        'How many checks and statuses the head commit has, passing or not.',
      ),
  },
);

export const githubFeedCheckSchema = z.object({
  name: z.string(),
  kind: z.enum(['check_run', 'status']),
  app: z
    .string()
    .nullable()
    .describe('The app that reported a check run. Null for a commit status.'),
  state: checkOutcomeSchema,
  url: linkSchema.nullable(),
  failingSince: z.coerce
    .date()
    .nullable()
    .describe(
      'When the check began failing, kept only across consecutive failing reads. A pending, success, neutral or skipped read clears it, so a later failure starts afresh. Null unless it is failing.',
    ),
  watched: z
    .boolean()
    .describe(
      'Whether the check counts toward `watchedState`: a repository says to watch it, or a rule matches its name and the repository doesn’t ignore it.',
    ),
  watchSource: watchSourceSchema
    .nullable()
    .describe(
      'What made the check watched: a rule for every repository, or this repository’s own exception. Null when it isn’t watched.',
    ),
});

export const githubFeedDefaultBranchSchema = z.object({
  repository: z.object({ fullName: z.string(), url: linkSchema }),
  branch: z.string(),
  headSha: z.string(),
  state: checkStateSchema
    .nullable()
    .describe(
      'How the head’s checks add up. Null when the head has no checks or Dash could not read them.',
    ),
  watchedState: watchedStateSchema.describe(
    'How the head’s watched checks add up, ignoring the rest. `none` when nothing on the head is watched, and then the repository is in no failure count.',
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
  workflowName: z.string(),
  runNumber: z.number().int(),
  branch: z.string(),
  headSha: z.string(),
  event: z.string(),
  conclusion: z.enum(['failure', 'timed_out', 'startup_failure']),
  pullRequestId: z.string().nullable(),
});

export const githubFeedReleaseSchema = feedItemSchema
  .omit({ updatedAt: true })
  .extend({
    tagName: z.string(),
    name: z
      .string()
      .nullable()
      .describe('Null when the release has no title of its own.'),
    author: z.string().nullable(),
    prerelease: z.boolean(),
    publishedAt: z.coerce.date(),
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
  myPullRequests: z.array(githubFeedMyPullRequestSchema),
  recentMerges: z
    .array(githubFeedPullRequestSchema)
    .describe(
      'The viewer’s pull requests merged in the last 48 hours; Home shows the last 24.',
    ),
  releases: z
    .array(githubFeedReleaseSchema)
    .describe(
      'Releases published in the last 48 hours; Home shows the last 24.',
    ),
  failedRuns: z.array(githubFeedRunSchema),
  defaultBranches: z.array(githubFeedDefaultBranchSchema),
  assignedIssues: z.array(githubFeedIssueSchema),
});

export type WatchedState = z.infer<typeof watchedStateSchema>;
export type WatchSource = z.infer<typeof watchSourceSchema>;
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
