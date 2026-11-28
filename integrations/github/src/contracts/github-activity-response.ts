import type {
  ActivityChecks,
  ActivityRepository,
  ActivityReviewer,
  ActivityRun,
  CheckState,
} from '@dash/integrations-core';
import { z } from 'zod';

import {
  type GithubCheckContext,
  githubCheckContextNodesSchema,
} from '#src/contracts/github-check-response.ts';

const failedConclusions = new Map<string, ActivityRun['conclusion']>([
  ['FAILURE', 'failure'],
  ['TIMED_OUT', 'timed_out'],
  ['STARTUP_FAILURE', 'startup_failure'],
]);

const successfulCheckRuns = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const failedCheckRuns = new Set([
  'FAILURE',
  'TIMED_OUT',
  'CANCELLED',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
  'ERROR',
]);

const loginSchema = z.object({ login: z.string().min(1) });

export const githubRepositoryNodeSchema = z
  .object({
    id: z.string().min(1),
    nameWithOwner: z.string().min(1),
    url: z.url(),
    isArchived: z.boolean(),
    defaultBranchRef: z.object({ name: z.string().min(1) }).nullable(),
  })
  .transform((repository): ActivityRepository => ({
    provider: 'github',
    externalId: repository.id,
    url: repository.url,
    fullName: repository.nameWithOwner,
    defaultBranch: repository.defaultBranchRef?.name ?? null,
    archived: repository.isArchived,
  }));

export const githubFailedSuiteSchema = z
  .object({
    conclusion: z.string().nullable(),
    workflowRun: z
      .object({
        id: z.string().min(1),
        runNumber: z.int().positive(),
        url: z.url(),
        event: z.string().min(1),
        updatedAt: z.iso.datetime({ offset: true }),
        workflow: z.object({ name: z.string().min(1) }),
      })
      .nullable(),
  })
  .transform((suite) => {
    const conclusion =
      suite.conclusion === null
        ? undefined
        : failedConclusions.get(suite.conclusion);
    return conclusion === undefined || suite.workflowRun === null
      ? null
      : { ...suite.workflowRun, conclusion };
  });

const countsSchema = z.array(
  z.object({ state: z.string(), count: z.int().nonnegative() }),
);

const rollupStateSchema = z
  .enum(['SUCCESS', 'FAILURE', 'ERROR', 'PENDING', 'EXPECTED'])
  .transform((state): CheckState => {
    if (state === 'SUCCESS') {
      return 'success';
    }
    return state === 'FAILURE' || state === 'ERROR' ? 'failure' : 'pending';
  });

/** A pull request head's checks as counts, plus the checks themselves when the query named them. */
export interface GithubPullRequestChecks {
  summary: ActivityChecks;
  contexts: GithubCheckContext[];
}

const checksSchema = z
  .object({
    state: rollupStateSchema,
    contexts: z.object({
      checkRunCountsByState: countsSchema.nullable(),
      statusContextCountsByState: countsSchema.nullable(),
      nodes: githubCheckContextNodesSchema,
    }),
  })
  .transform((rollup): GithubPullRequestChecks => {
    const counts = { success: 0, failure: 0, pending: 0 };
    for (const { state, count } of [
      ...(rollup.contexts.checkRunCountsByState ?? []),
      ...(rollup.contexts.statusContextCountsByState ?? []),
    ]) {
      const bucket: CheckState = successfulCheckRuns.has(state)
        ? 'success'
        : failedCheckRuns.has(state)
          ? 'failure'
          : 'pending';
      counts[bucket] += count;
    }
    return {
      summary: { state: rollup.state, ...counts },
      contexts: rollup.contexts.nodes,
    };
  });

const branchRollupSchema = z
  .object({
    state: rollupStateSchema,
    contexts: z.object({
      totalCount: z.int().nonnegative(),
      nodes: githubCheckContextNodesSchema,
    }),
  })
  .transform((rollup) => ({
    state: rollup.state,
    contexts: rollup.contexts.nodes,
    truncated: rollup.contexts.totalCount > rollup.contexts.nodes.length,
  }));

const reviewerSchema = z
  .object({
    __typename: z.string(),
    login: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
  })
  .nullable()
  .transform((reviewer): ActivityReviewer | null => {
    if (reviewer?.slug !== undefined) {
      return { kind: 'team', name: reviewer.slug };
    }
    return reviewer?.login === undefined
      ? null
      : { kind: 'user', name: reviewer.login };
  });

export const githubPullRequestNodeSchema = z.object({
  id: z.string().min(1),
  number: z.int().positive(),
  title: z.string(),
  url: z.url(),
  state: z
    .enum(['OPEN', 'CLOSED', 'MERGED'])
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(['open', 'closed', 'merged'])),
  isDraft: z.boolean(),
  mergeable: z
    .enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN'])
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(['mergeable', 'conflicting', 'unknown'])),
  reviewDecision: z
    .enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])
    .transform((value) => value.toLowerCase())
    .pipe(z.enum(['approved', 'changes_requested', 'review_required']))
    .nullable(),
  mergedAt: z.iso.datetime({ offset: true }).nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
  headRefName: z.string().min(1),
  headRefOid: z.string().min(1),
  author: loginSchema.nullable(),
  repository: githubRepositoryNodeSchema,
  reviewRequests: z.object({
    nodes: z.array(z.object({ requestedReviewer: reviewerSchema })),
  }),
  commits: z.object({
    nodes: z.array(
      z.object({
        commit: z.object({
          statusCheckRollup: checksSchema.nullable(),
          checkSuites: z.object({ nodes: z.array(githubFailedSuiteSchema) }),
        }),
      }),
    ),
  }),
});

export const githubIssueNodeSchema = z.object({
  id: z.string().min(1),
  number: z.int().positive(),
  title: z.string(),
  url: z.url(),
  updatedAt: z.iso.datetime({ offset: true }),
  author: loginSchema.nullable(),
  repository: githubRepositoryNodeSchema,
  assignees: z.object({ nodes: z.array(loginSchema) }),
});

export const githubReleaseNodeSchema = z.object({
  id: z.string().min(1),
  name: z
    .string()
    .nullable()
    .transform((name) => (name === null || name === '' ? null : name)),
  tagName: z.string().min(1),
  url: z.url(),
  isDraft: z.boolean(),
  isPrerelease: z.boolean(),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  author: loginSchema.nullable(),
});

const searchPageSchema = <T extends z.ZodType>(node: T) =>
  z.object({
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable(),
    }),
    nodes: z.array(node),
  });

export const githubSearchDataSchema = z.object({
  review: searchPageSchema(githubPullRequestNodeSchema).optional(),
  authored: searchPageSchema(githubPullRequestNodeSchema).optional(),
  assigned: searchPageSchema(githubIssueNodeSchema).optional(),
  merged: searchPageSchema(githubPullRequestNodeSchema).optional(),
});

export const githubDefaultBranchNodeSchema = z
  .object({
    id: z.string().min(1),
    nameWithOwner: z.string().min(1),
    url: z.url(),
    isArchived: z.boolean(),
    defaultBranchRef: z
      .object({
        name: z.string().min(1),
        target: z
          .object({
            oid: z.string().min(1).optional(),
            statusCheckRollup: branchRollupSchema.nullable().optional(),
            checkSuites: z
              .object({ nodes: z.array(githubFailedSuiteSchema) })
              .optional(),
          })
          .nullable(),
      })
      .nullable(),
  })
  .nullable();

export const githubReleasesNodeSchema = z
  .object({
    id: z.string().min(1),
    releases: z.object({ nodes: z.array(githubReleaseNodeSchema) }),
  })
  .nullable();

const githubGraphqlDataSchema = z.record(z.string(), z.json());

export const githubGraphqlEnvelopeSchema = z.object({
  data: githubGraphqlDataSchema.nullable().optional(),
  errors: z
    .array(z.object({ type: z.string().optional(), message: z.string() }))
    .optional(),
});

export type GithubPullRequestNode = z.infer<typeof githubPullRequestNodeSchema>;
export type GithubReleaseNode = z.infer<typeof githubReleaseNodeSchema>;
export type GithubIssueNode = z.infer<typeof githubIssueNodeSchema>;
export type GithubFailedSuite = z.infer<typeof githubFailedSuiteSchema>;
export type GithubDefaultBranchNode = z.infer<
  typeof githubDefaultBranchNodeSchema
>;
export type GithubReleasesNode = z.infer<typeof githubReleasesNodeSchema>;
export type GithubSearchData = z.infer<typeof githubSearchDataSchema>;
export type GithubGraphqlData = z.infer<typeof githubGraphqlDataSchema>;
export type GithubGraphqlVariables = Readonly<
  Record<string, string | number | boolean | null>
>;
