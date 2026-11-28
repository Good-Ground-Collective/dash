import { describe, expect, it } from 'vitest';

import { ActivityNodes } from '#src/__tests__/support/activity-nodes.ts';
import { githubActivityQueries } from '#src/contracts/github-activity-queries.ts';
import { GithubActivityRecords } from '#src/contracts/github-activity-records.ts';
import { githubDefaultBranchNodeSchema } from '#src/contracts/github-activity-response.ts';

const { defaultBranchNode, releaseNode } = ActivityNodes;

class Read {
  static of(releases: ReturnType<typeof releaseNode>[]) {
    const node = githubDefaultBranchNodeSchema
      .unwrap()
      .parse(defaultBranchNode({ fullName: 'acme/app', releases }));
    return GithubActivityRecords.defaultBranch(node);
  }
}

describe('GithubActivityRecords release reads', () => {
  it('asks for the ten newest releases of each repository', () => {
    expect(githubActivityQueries.defaultBranches(2)).toContain(
      'releases(first: 10,',
    );
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
