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

const { defaultBranchNode, releasesNode, releaseNode, failedSuite } =
  ActivityNodes;

const twoRepositories = { ...query, repositories: ['acme/app', 'acme/web'] };

/** acme/app is private: the App may read its default branch but not its releases. */
class ForbiddenReleases {
  static github(): FakeGithubGraphql {
    return new FakeGithubGraphql()
      .withEmptyActivity()
      .on({
        operation: 'DashDefaultBranches',
        reply: () => ({
          data: {
            repository0: defaultBranchNode({
              fullName: 'acme/app',
              suites: [failedSuite({ id: 'WFR_private', name: 'ci' })],
            }),
            repository1: defaultBranchNode({ fullName: 'acme/web' }),
          },
        }),
      })
      .on({
        operation: 'DashReleases',
        reply: () => ({
          data: {
            repository0: null,
            repository1: releasesNode({
              fullName: 'acme/web',
              releases: [
                releaseNode({
                  id: 'REL_web',
                  fullName: 'acme/web',
                  publishedAt: '2026-11-26T09:00:00Z',
                }),
              ],
            }),
          },
          errors: [
            {
              type: 'FORBIDDEN',
              message: 'Resource not accessible by integration',
            },
          ],
        }),
      });
  }
}

describe('GithubActivityReleases private repositories without release access', () => {
  it('keeps a repository default branch failed runs when its releases are forbidden', async () => {
    const activity = await ForbiddenReleases.github()
      .feed()
      .read(twoRepositories);

    expect(activity.failedRuns.map(({ externalId }) => externalId)).toEqual([
      'WFR_private',
    ]);
    expect(activity.repositories.map(({ fullName }) => fullName)).toEqual([
      'acme/app',
      'acme/web',
    ]);
  });

  it('still reads the releases of the other repositories', async () => {
    const activity = await ForbiddenReleases.github()
      .feed()
      .read(twoRepositories);

    expect(activity.releases.map(({ externalId }) => externalId)).toEqual([
      'REL_web',
    ]);
  });

  it('leaves a repository whose releases were forbidden out of the release reads', async () => {
    const activity = await ForbiddenReleases.github()
      .feed()
      .read(twoRepositories);

    expect(activity.releaseReads).toEqual([
      {
        repositoryId: 'R_acme/web',
        exhaustive: true,
        oldestPublishedAt: '2026-11-26T09:00:00Z',
      },
    ]);
  });

  it('reads releases apart from the default branches', async () => {
    const github = ForbiddenReleases.github();

    await github.feed().read(twoRepositories);

    expect(github.callsTo('DashDefaultBranches')).toHaveLength(1);
    expect(github.callsTo('DashReleases')).toHaveLength(1);
  });
});

class RecentReleases {
  static github(): FakeGithubGraphql {
    return new FakeGithubGraphql().withEmptyActivity().on({
      operation: 'DashReleases',
      reply: () => ({
        data: {
          repository0: releasesNode({
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
              releaseNode({
                id: 'REL_old',
                publishedAt: '2026-11-20T09:00:00Z',
              }),
              releaseNode({
                id: 'REL_draft',
                publishedAt: '2026-11-26T09:30:00Z',
                draft: true,
              }),
              releaseNode({ id: 'REL_unpublished', publishedAt: null }),
            ],
          }),
        },
      }),
    });
  }
}

describe('GithubActivityReleases recent releases', () => {
  it('reads published releases since the cutoff, behind newer drafts, and skips drafts and older ones', async () => {
    const activity = await RecentReleases.github().feed().read(query);

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
