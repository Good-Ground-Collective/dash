import type { ActivityQuery } from '@dash/integrations-core';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { ActivityNodes } from '#src/__tests__/support/activity-nodes.ts';
import { FakeGithubGraphql } from '#src/__tests__/support/fake-github-graphql.ts';
import { GithubGraphqlError } from '#src/errors.ts';

const query: ActivityQuery = {
  installationId: '42',
  account: { login: 'acme', kind: 'organization' },
  viewerLogin: 'octocat',
  repositories: ['acme/app'],
  since: '2026-11-25T12:00:00Z',
};

const {
  page,
  pullRequestNode,
  issueNode,
  failedSuite,
  defaultBranchNode,
  releaseNode,
} = ActivityNodes;

const busyAccount = new FakeGithubGraphql()
  .on({
    operation: 'DashActivity',
    reply: () => ({
      data: {
        review: page({ nodes: [pullRequestNode({ number: 1 })] }),
        authored: page({
          nodes: [
            pullRequestNode({
              number: 2,
              author: 'octocat',
              suites: [
                failedSuite({ id: 'WFR_2', name: 'ci' }),
                failedSuite({
                  id: 'WFR_3',
                  name: 'lint',
                  conclusion: 'SUCCESS',
                }),
              ],
            }),
          ],
        }),
        assigned: page({ nodes: [issueNode({ number: 9 })] }),
        merged: page({
          nodes: [
            pullRequestNode({
              number: 3,
              author: 'octocat',
              mergedAt: '2026-11-26T08:00:00Z',
              suites: [failedSuite({ id: 'WFR_merged', name: 'ci' })],
            }),
          ],
        }),
      },
    }),
  })
  .on({
    operation: 'DashDefaultBranches',
    reply: () => ({
      data: {
        repository0: defaultBranchNode({
          fullName: 'acme/app',
          releases: [
            ...Array.from({ length: 5 }, (_, index) =>
              releaseNode({
                id: `REL_newer_draft_${index}`,
                publishedAt: null,
                draft: true,
              }),
            ),
            releaseNode({
              id: 'REL_new',
              name: 'Dash 1.2.0',
              publishedAt: '2026-11-26T09:00:00Z',
            }),
            releaseNode({ id: 'REL_old', publishedAt: '2026-11-20T09:00:00Z' }),
            releaseNode({
              id: 'REL_draft',
              publishedAt: '2026-11-26T09:30:00Z',
              draft: true,
            }),
            releaseNode({ id: 'REL_unpublished', publishedAt: null }),
          ],
          suites: [
            failedSuite({
              id: 'WFR_9',
              name: 'deploy',
              conclusion: 'TIMED_OUT',
            }),
            failedSuite({ id: 'WFR_10', name: 'ci', conclusion: 'CANCELLED' }),
          ],
        }),
      },
    }),
  });

describe('GithubActivityFeed pull requests and issues', () => {
  it('reads review requests with their reviewers and check counts', async () => {
    const activity = await busyAccount.feed().read(query);

    expect(activity.reviewRequests).toEqual([
      expect.objectContaining({
        externalId: 'PR_acme/app_1',
        url: 'https://github.com/acme/app/pull/1',
        repositoryId: 'R_acme/app',
        author: 'grace',
        state: 'open',
        mergeable: 'mergeable',
        reviewDecision: 'review_required',
        headSha: 'sha1',
        requestedReviewers: [
          { kind: 'user', name: 'octocat' },
          { kind: 'team', name: 'platform' },
        ],
        checks: { state: 'failure', success: 4, failure: 2, pending: 2 },
      }),
    ]);
    expect(activity.authoredPullRequests.map(({ number }) => number)).toEqual([
      2,
    ]);
    expect(activity.truncated).toBe(false);
  });

  it('reads assigned issues and the repositories everything is in', async () => {
    const activity = await busyAccount.feed().read(query);

    expect(activity.assignedIssues).toEqual([
      expect.objectContaining({
        externalId: 'I_9',
        assignees: ['octocat', 'grace'],
        author: null,
      }),
    ]);
    expect(activity.repositories).toEqual([
      expect.objectContaining({
        externalId: 'R_acme/app',
        fullName: 'acme/app',
      }),
    ]);
  });
});

describe('GithubActivityFeed merges and releases', () => {
  it('reads pull requests the viewer merged, with the merge time and without their failed runs', async () => {
    const activity = await busyAccount.feed().read(query);

    expect(activity.mergedPullRequests).toEqual([
      expect.objectContaining({
        externalId: 'PR_acme/app_3',
        state: 'merged',
        mergedAt: '2026-11-26T08:00:00Z',
      }),
    ]);
    expect(activity.authoredPullRequests[0]?.mergedAt).toBeNull();
    expect(
      activity.failedRuns.map(({ externalId }) => externalId),
    ).not.toContain('WFR_merged');
  });

  it('reads published releases since the cutoff, behind newer drafts, and skips drafts and older ones', async () => {
    const activity = await busyAccount.feed().read(query);

    expect(activity.releases).toEqual([
      {
        provider: 'github',
        externalId: 'REL_new',
        url: 'https://github.com/acme/app/releases/tag/v-REL_new',
        repositoryId: 'R_acme/app',
        tagName: 'v-REL_new',
        name: 'Dash 1.2.0',
        author: 'grace',
        prerelease: false,
        publishedAt: '2026-11-26T09:00:00Z',
      },
    ]);
    expect(activity.releaseReads).toEqual([
      {
        repositoryId: 'R_acme/app',
        exhaustive: true,
        oldestPublishedAt: '2026-11-20T09:00:00Z',
      },
    ]);
  });
});

describe('GithubActivityFeed failed runs', () => {
  it('keeps failed runs on pull request heads and default branches, and drops the rest', async () => {
    const activity = await busyAccount.feed().read(query);

    expect(activity.failedRuns).toEqual([
      expect.objectContaining({
        externalId: 'WFR_2',
        pullRequestId: 'PR_acme/app_2',
        branch: 'feature-2',
        headSha: 'sha2',
        conclusion: 'failure',
      }),
      expect.objectContaining({
        externalId: 'WFR_9',
        pullRequestId: null,
        branch: 'main',
        headSha: 'head-acme/app',
        conclusion: 'timed_out',
      }),
    ]);
  });

  it('skips a repository GitHub no longer shows', async () => {
    const github = new FakeGithubGraphql().withEmptyActivity().on({
      operation: 'DashDefaultBranches',
      reply: () => ({
        data: { repository0: null },
        errors: [
          { type: 'NOT_FOUND', message: 'Could not resolve to a Repository' },
        ],
      }),
    });

    const activity = await github.feed().read(query);

    expect(activity.repositories).toEqual([]);
  });
});

describe('GithubActivityFeed requests', () => {
  it('reads with an installation token and scopes every search to the account', async () => {
    const github = new FakeGithubGraphql().withEmptyActivity();

    await github.feed().read(query);

    const [search] = github.callsTo('DashActivity');
    expect(github.tokenRequests).toEqual([
      '/app/installations/42/access_tokens',
    ]);
    expect(search?.authorization).toBe('token ghs_installation');
    expect(search?.variables).toMatchObject({
      reviewQuery:
        'is:pr is:open archived:false sort:updated-desc review-requested:octocat org:acme',
      authoredQuery:
        'is:pr is:open archived:false sort:updated-desc author:octocat org:acme',
      assignedQuery:
        'is:issue is:open archived:false sort:updated-desc assignee:octocat org:acme',
      mergedQuery:
        'is:pr is:merged merged:>=2026-11-25T12:00:00Z archived:false sort:updated-desc author:octocat org:acme',
    });
  });

  it('throws when GitHub rejects the search', async () => {
    const github = new FakeGithubGraphql().withEmptyActivity().on({
      operation: 'DashActivity',
      reply: () => ({
        data: null,
        errors: [{ message: 'Something went wrong' }],
      }),
    });

    await expect(github.feed().read(query)).rejects.toThrow(GithubGraphqlError);
  });

  it('refuses a viewer login that would add search qualifiers', async () => {
    const github = new FakeGithubGraphql().withEmptyActivity();

    await expect(
      github.feed().read({ ...query, viewerLogin: 'octocat org:other' }),
    ).rejects.toThrow(ZodError);
    expect(github.calls).toEqual([]);
  });
});

describe('GithubActivityFeed default branches', () => {
  it('checks at most thirty, ten per request, repositories with the viewer’s work first', async () => {
    const repositories = Array.from(
      { length: 40 },
      (_, index) => `acme/repo-${index}`,
    );
    const github = new FakeGithubGraphql().withEmptyActivity().on({
      operation: 'DashActivity',
      reply: () => ({
        data: {
          review: page({ nodes: [] }),
          authored: page({
            nodes: [
              pullRequestNode({
                number: 1,
                author: 'octocat',
                fullName: 'acme/touched',
              }),
            ],
          }),
          assigned: page({ nodes: [] }),
          merged: page({ nodes: [] }),
        },
      }),
    });

    const activity = await github.feed().read({ ...query, repositories });

    const batches = github.callsTo('DashDefaultBranches');
    const names = batches.flatMap(({ variables }) =>
      Object.keys(variables).filter((key) => key.startsWith('name')),
    );
    expect(batches).toHaveLength(3);
    expect(batches[0]?.variables).toMatchObject({
      owner0: 'acme',
      name0: 'touched',
    });
    expect(names).toHaveLength(30);
    expect(activity.truncated).toBe(true);
  });
});

describe('GithubActivityFeed props', () => {
  it.each([{ appId: '' }, { privateKey: '' }])('refuses %o', (credentials) => {
    expect(() => new FakeGithubGraphql().feed(credentials)).toThrow(ZodError);
  });
});
