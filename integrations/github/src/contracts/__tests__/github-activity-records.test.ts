import { describe, expect, it } from 'vitest';

import { ActivityNodes } from '#src/__tests__/support/activity-nodes.ts';
import { githubActivityQueries } from '#src/contracts/github-activity-queries.ts';
import { GithubActivityRecords } from '#src/contracts/github-activity-records.ts';
import {
  githubDefaultBranchNodeSchema,
  githubPullRequestNodeSchema,
  githubReleasesNodeSchema,
} from '#src/contracts/github-activity-response.ts';

const { releasesNode, releaseNode } = ActivityNodes;

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

describe('GithubActivityRecords default branch checks', () => {
  const { defaultBranchNode, checkRunNode, statusContextNode } = ActivityNodes;

  const defaultBranch = (node: ReturnType<typeof defaultBranchNode>) =>
    GithubActivityRecords.defaultBranch(
      githubDefaultBranchNodeSchema.unwrap().parse(node),
    );

  it('reports the head, how its checks add up and every check, check runs and statuses alike', () => {
    const read = defaultBranch(
      defaultBranchNode({
        fullName: 'acme/app',
        rollup: {
          state: 'FAILURE',
          contexts: [
            checkRunNode({ name: 'build', workflowRunId: 77, jobId: 9001 }),
            statusContextNode({ context: 'legacy/ci', state: 'ERROR' }),
          ],
        },
      }),
    );

    expect(read.branch).toEqual({
      repositoryId: 'R_acme/app',
      branch: 'main',
      headSha: 'head-acme/app',
      state: 'failure',
      checksTruncated: false,
    });
    expect(read.checks).toEqual([
      {
        subjectKind: 'default_branch',
        subjectId: 'R_acme/app',
        headSha: 'head-acme/app',
        name: 'build',
        kind: 'check_run',
        app: 'github-actions',
        state: 'success',
        url: 'https://github.com/acme/app/runs/build',
        workflowRunId: 77,
        jobId: 9001,
      },
      expect.objectContaining({
        name: 'legacy/ci',
        kind: 'status',
        state: 'failure',
      }),
    ]);
  });
});

describe('GithubActivityRecords default branch check truncation', () => {
  const { defaultBranchNode, checkRunNode } = ActivityNodes;

  const defaultBranch = (node: ReturnType<typeof defaultBranchNode>) =>
    GithubActivityRecords.defaultBranch(
      githubDefaultBranchNodeSchema.unwrap().parse(node),
    );

  it('flags a head with more checks than the read returned', () => {
    const read = defaultBranch(
      defaultBranchNode({
        fullName: 'acme/app',
        rollup: {
          state: 'FAILURE',
          totalCount: 140,
          contexts: [checkRunNode({ name: 'build' })],
        },
      }),
    );

    expect(read.branch?.checksTruncated).toBe(true);
    expect(read.checks).toHaveLength(1);
  });

  it('asks GitHub how many checks the head has', () => {
    expect(githubActivityQueries.defaultBranches(1)).toContain(
      'totalCount nodes',
    );
  });
});

describe('GithubActivityRecords default branches without checks', () => {
  const { defaultBranchNode } = ActivityNodes;

  const defaultBranch = (node: ReturnType<typeof defaultBranchNode>) =>
    GithubActivityRecords.defaultBranch(
      githubDefaultBranchNodeSchema.unwrap().parse(node),
    );

  it('reports a null state and no checks for a head whose rollup is missing', () => {
    const read = defaultBranch(
      defaultBranchNode({ fullName: 'acme/app', rollup: null }),
    );

    expect(read.branch).toMatchObject({
      headSha: 'head-acme/app',
      state: null,
    });
    expect(read.checks).toEqual([]);
  });

  it('reports no default branch for a repository without a head', () => {
    const read = defaultBranch({
      ...ActivityNodes.repositoryNode({ fullName: 'acme/app' }),
      defaultBranchRef: null,
    });

    expect(read.branch).toBeNull();
    expect(read.checks).toEqual([]);
  });
});

describe('GithubActivityRecords pull request checks', () => {
  const { pullRequestNode, checkRunNode, statusContextNode } = ActivityNodes;

  it('keeps only the failing checks of a pull request head', () => {
    const node = githubPullRequestNodeSchema.parse(
      pullRequestNode({
        number: 2,
        contexts: [
          checkRunNode({ name: 'build' }),
          checkRunNode({ name: 'lint', conclusion: 'FAILURE' }),
          checkRunNode({
            name: 'slow',
            status: 'IN_PROGRESS',
            conclusion: null,
          }),
          statusContextNode({ context: 'legacy/ci', state: 'FAILURE' }),
        ],
      }),
    );

    expect(
      GithubActivityRecords.pullRequestFailingChecks(node).map(
        ({ subjectKind, subjectId, headSha, name }) => ({
          subjectKind,
          subjectId,
          headSha,
          name,
        }),
      ),
    ).toEqual([
      {
        subjectKind: 'pull_request',
        subjectId: 'PR_acme/app_2',
        headSha: 'sha2',
        name: 'lint',
      },
      {
        subjectKind: 'pull_request',
        subjectId: 'PR_acme/app_2',
        headSha: 'sha2',
        name: 'legacy/ci',
      },
    ]);
  });

  it('names no check of a pull request whose query counted them only', () => {
    const node = githubPullRequestNodeSchema.parse(
      pullRequestNode({ number: 1 }),
    );

    expect(GithubActivityRecords.pullRequestFailingChecks(node)).toEqual([]);
    expect(GithubActivityRecords.pullRequest(node).checks).toEqual({
      state: 'failure',
      success: 4,
      failure: 2,
      pending: 2,
    });
  });
});
