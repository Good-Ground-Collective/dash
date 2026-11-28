import type { ActivityQuery } from '@dash/integrations-core';
import { describe, expect, it } from 'vitest';

import { ActivityNodes } from '#src/__tests__/support/activity-nodes.ts';
import { FakeGithubGraphql } from '#src/__tests__/support/fake-github-graphql.ts';

const query: ActivityQuery = {
  installationId: '42',
  account: { login: 'acme', kind: 'organization' },
  viewerLogin: 'octocat',
  repositories: ['acme/app'],
  since: '2026-11-25T12:00:00Z',
};

const { page, pullRequestNode } = ActivityNodes;

describe('GithubActivitySearch pagination', () => {
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
                merged: page({ nodes: [] }),
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
          merged: page({ nodes: [] }),
        },
      }),
    });

    const activity = await github.feed().read(query);

    expect(github.callsTo('DashActivity')).toHaveLength(3);
    expect(activity.reviewRequests).toHaveLength(3);
    expect(activity.truncated).toBe(true);
  });
});
