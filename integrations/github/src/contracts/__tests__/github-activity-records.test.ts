import { describe, expect, it } from 'vitest';

import { ActivityNodes } from '#src/__tests__/support/activity-nodes.ts';
import { githubActivityQueries } from '#src/contracts/github-activity-queries.ts';
import { GithubActivityRecords } from '#src/contracts/github-activity-records.ts';
import {
  githubPullRequestNodeSchema,
  githubReleasesNodeSchema,
} from '#src/contracts/github-activity-response.ts';

const { releasesNode, releaseNode, pullRequestNode } = ActivityNodes;

class Read {
  static of(releases: ReturnType<typeof releaseNode>[]) {
    const node = githubReleasesNodeSchema
      .unwrap()
      .parse(releasesNode({ fullName: 'acme/app', releases }));
    return GithubActivityRecords.releases(node);
  }
}

describe('GithubActivityRecords release reads', () => {
  it('asks for the ten newest releases of each repository, apart from the default branches', () => {
    expect(githubActivityQueries.defaultBranches(2)).not.toContain('releases');
    expect(githubActivityQueries.releases(2)).toContain('releases(first: 10,');
  });

  it('reports a repository whose releases were all returned as exhaustive, back to the oldest published', () => {
    const { releaseRead } = Read.of([
      releaseNode({ id: 'REL_new', publishedAt: '2026-11-26T09:00:00Z' }),
      releaseNode({ id: 'REL_old', publishedAt: '2026-11-20T09:00:00Z' }),
      releaseNode({ id: 'REL_draft', publishedAt: null, draft: true }),
    ]);

    expect(releaseRead).toEqual({
      repositoryId: 'R_acme/app',
      exhaustive: true,
      oldestPublishedAt: '2026-11-20T09:00:00Z',
    });
  });

  it('reports a repository that filled the page as not exhaustive', () => {
    const { releaseRead } = Read.of(
      Array.from({ length: 10 }, (_, index) =>
        releaseNode({
          id: `REL_${index}`,
          publishedAt: `2026-11-26T0${index}:00:00Z`,
        }),
      ),
    );

    expect(releaseRead).toEqual({
      repositoryId: 'R_acme/app',
      exhaustive: false,
      oldestPublishedAt: '2026-11-26T00:00:00Z',
    });
  });

  it('reports no oldest publish time when every release is a draft', () => {
    const { releaseRead } = Read.of([
      releaseNode({ id: 'REL_draft', publishedAt: null, draft: true }),
    ]);

    expect(releaseRead.oldestPublishedAt).toBeNull();
  });
});

describe('GithubActivityRecords pull request age and merge state', () => {
  it('carries when the pull request was opened and GitHub’s merge state lowercased', () => {
    const record = GithubActivityRecords.pullRequest(
      githubPullRequestNodeSchema.parse(
        pullRequestNode({ number: 1, mergeStateStatus: 'HAS_HOOKS' }),
      ),
    );

    expect(record).toMatchObject({
      createdAt: '2026-11-20T08:00:00Z',
      mergeState: 'has_hooks',
    });
  });

  it('keeps no merge state when GitHub returns none', () => {
    const record = GithubActivityRecords.pullRequest(
      githubPullRequestNodeSchema.parse(
        pullRequestNode({ number: 1, mergeStateStatus: null }),
      ),
    );

    expect(record.mergeState).toBeNull();
  });

  it('asks the search for both fields', () => {
    expect(githubActivityQueries.search).toContain('createdAt');
    expect(githubActivityQueries.search).toContain('mergeStateStatus');
  });
});
