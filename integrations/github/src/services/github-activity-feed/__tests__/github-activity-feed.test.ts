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
};

const { page, pullRequestNode, issueNode, failedSuite, defaultBranchNode } =
  ActivityNodes;

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
      },
    }),
  })
  .on({
    operation: 'DashDefaultBranches',
    reply: () => ({
      data: {
        repository0: defaultBranchNode({
          fullName: 'acme/app',
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

describe('GithubActivityFeed pagination', () => {
  it('pages only the searches that have more, from their cursors', async () => {
    const github = new FakeGithubGraphql().withEmptyActivity().on({
      operation: 'DashActivity',
      reply: ({ variables }) => ({
        data:
          variables['reviewAfter'] === null
            ? {
                review: page({
                  nodes: [pullRequestNode({ number: 1 })],
                  next: 'cursor-1',
                }),
                authored: page({ nodes: [] }),
                assigned: page({ nodes: [] }),
              }
            : { review: page({ nodes: [pullRequestNode({ number: 2 })] }) },
      }),
    });

    const activity = await github.feed().read(query);

    const [, second] = github.callsTo('DashActivity');
    expect(second?.variables).toMatchObject({
      reviewAfter: 'cursor-1',
      withReview: true,
      withAuthored: false,
      withAssigned: false,
    });
    expect(activity.reviewRequests.map(({ number }) => number)).toEqual([1, 2]);
    expect(activity.truncated).toBe(false);
  });

  it('stops after three search pages and says the list was cut short', async () => {
    const github = new FakeGithubGraphql().withEmptyActivity().on({
      operation: 'DashActivity',
      reply: ({ variables }) => ({
        data: {
          review: page({
            nodes: [
              pullRequestNode({
                number: String(variables['reviewAfter']).length,
              }),
            ],
            next: `${String(variables['reviewAfter'])}+`,
          }),
          authored: page({ nodes: [] }),
          assigned: page({ nodes: [] }),
        },
      }),
    });

    const activity = await github.feed().read(query);

    expect(github.callsTo('DashActivity')).toHaveLength(3);
    expect(activity.reviewRequests).toHaveLength(3);
    expect(activity.truncated).toBe(true);
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
