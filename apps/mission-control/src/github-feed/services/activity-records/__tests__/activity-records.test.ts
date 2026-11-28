import type { ActivityCheck } from '@dash/integrations-core';
import { describe, expect, it } from 'vitest';

import { GithubFeedFixtures } from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { githubRecordsSchema } from '#src/github-feed/contracts/github-records.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';

describe('ActivityRecords', () => {
  it('reads an activity as valid rows for every table', () => {
    const records = ActivityRecords.from({
      activity: GithubFeedFixtures.activity(),
      viewerLogin: 'ada',
    });

    expect(githubRecordsSchema.parse(records)).toEqual(records);
    expect(records.pullRequests.map(({ nodeId }) => nodeId)).toEqual([
      'PR_1',
      'PR_2',
    ]);
    expect(records.checkRollups).toEqual([
      {
        pullRequestNodeId: 'PR_1',
        headSha: 'sha1',
        state: 'failure',
        successCount: 3,
        failureCount: 1,
        pendingCount: 0,
      },
    ]);
    expect(records.reviewRequests).toEqual([
      { pullRequestNodeId: 'PR_1', reviewerKind: 'user', reviewer: 'ada' },
      { pullRequestNodeId: 'PR_1', reviewerKind: 'team', reviewer: 'platform' },
    ]);
  });

  it('stores when each pull request was opened and its merge state', () => {
    const records = ActivityRecords.from({
      activity: GithubFeedFixtures.activity(),
      viewerLogin: 'ada',
    });

    expect(records.pullRequests[0]).toMatchObject({
      createdAt: '2026-11-20T08:00:00.000Z',
      mergeState: 'clean',
    });
  });
});

describe('ActivityRecords checks', () => {
  it('stores each check against its subject and the default branch head on its repository', () => {
    const records = ActivityRecords.from({
      activity: GithubFeedFixtures.activity(),
      viewerLogin: 'ada',
    });

    expect(records.repositories).toEqual([
      expect.objectContaining({
        nodeId: 'R_app',
        defaultBranchHeadSha: 'main-head',
        defaultBranchState: 'failure',
      }),
    ]);
    expect(
      records.checks.map(
        ({ subjectNodeId, subjectKind, name, failingSince }) => ({
          subjectNodeId,
          subjectKind,
          name,
          failingSince,
        }),
      ),
    ).toEqual([
      {
        subjectNodeId: 'R_app',
        subjectKind: 'default_branch',
        name: 'build',
        failingSince: null,
      },
      {
        subjectNodeId: 'R_app',
        subjectKind: 'default_branch',
        name: 'codecov/patch',
        failingSince: null,
      },
      {
        subjectNodeId: 'PR_2',
        subjectKind: 'pull_request',
        name: 'lint',
        failingSince: null,
      },
    ]);
  });

  it('keeps one row for a check name read twice on the same subject, and leaves a repository without a head unmarked', () => {
    const activity = GithubFeedFixtures.activity();

    const records = ActivityRecords.from({
      activity: {
        ...activity,
        defaultBranches: [],
        checks: [...activity.checks, ...activity.checks],
      },
      viewerLogin: 'ada',
    });

    expect(records.checks).toHaveLength(3);
    expect(records.repositories[0]).toMatchObject({
      defaultBranchHeadSha: null,
      defaultBranchState: null,
    });
  });
});

class Deploys {
  static failing(overrides: Partial<ActivityCheck> = {}): ActivityCheck {
    return {
      ...GithubFeedFixtures.checkReads().checks[0]!,
      name: 'deploy',
      kind: 'check_run',
      app: 'vercel',
      state: 'failure',
      url: 'https://vercel.example.com/failed',
      ...overrides,
    };
  }

  static passing(): ActivityCheck {
    return Deploys.failing({
      kind: 'status',
      app: null,
      state: 'success',
      url: 'https://ci.example.com/passed',
    });
  }

  static stored(checks: ActivityCheck[]) {
    return ActivityRecords.from({
      activity: { ...GithubFeedFixtures.activity(), checks },
      viewerLogin: 'ada',
    }).checks.filter(({ name }) => name === 'deploy');
  }
}

describe('ActivityRecords checks read twice with different states', () => {
  it.each([
    {
      order: 'failure then success',
      checks: () => [Deploys.failing(), Deploys.passing()],
    },
    {
      order: 'success then failure',
      checks: () => [Deploys.passing(), Deploys.failing()],
    },
  ])(
    'keeps the failure and its own kind, app and url ($order)',
    ({ checks }) => {
      expect(Deploys.stored(checks())).toEqual([
        expect.objectContaining({
          state: 'failure',
          kind: 'check_run',
          app: 'vercel',
          url: 'https://vercel.example.com/failed',
        }),
      ]);
    },
  );

  it.each([
    ['failure', 'pending'],
    ['pending', 'neutral'],
    ['neutral', 'skipped'],
    ['skipped', 'success'],
  ] as const)('ranks %s above %s', (worse, better) => {
    const [kept] = Deploys.stored([
      Deploys.failing({ state: better }),
      Deploys.failing({ state: worse }),
      Deploys.failing({ state: better }),
    ]);

    expect(kept?.state).toBe(worse);
  });
});

describe('ActivityRecords default branch check truncation', () => {
  it('stores whether a default branch head has more checks than were read', () => {
    const activity = GithubFeedFixtures.activity();
    const records = ActivityRecords.from({
      activity: {
        ...activity,
        defaultBranches: activity.defaultBranches.map((branch) => ({
          ...branch,
          checksTruncated: true,
        })),
      },
      viewerLogin: 'ada',
    });

    expect(records.repositories[0]?.defaultBranchChecksTruncated).toBe(true);
  });
});

describe('ActivityRecords assignments', () => {
  it('assigns review requests to the viewer and issues to each assignee', () => {
    const records = ActivityRecords.from({
      activity: GithubFeedFixtures.activity(),
      viewerLogin: 'ada',
    });

    expect(records.assignments).toEqual([
      {
        subjectNodeId: 'PR_1',
        subjectKind: 'pull_request',
        login: 'ada',
        role: 'review_requested',
      },
      {
        subjectNodeId: 'I_5',
        subjectKind: 'issue',
        login: 'ada',
        role: 'assignee',
      },
      {
        subjectNodeId: 'I_5',
        subjectKind: 'issue',
        login: 'grace',
        role: 'assignee',
      },
    ]);
  });
});

describe('ActivityRecords duplicates', () => {
  it('keeps one row for a pull request both requested of and authored by the viewer', () => {
    const activity = GithubFeedFixtures.activity();
    const shared = GithubFeedFixtures.pullRequest({ number: 1 });

    const records = ActivityRecords.from({
      activity: {
        ...activity,
        reviewRequests: [shared],
        authoredPullRequests: [shared],
        repositories: [...activity.repositories, ...activity.repositories],
      },
      viewerLogin: 'ada',
    });

    expect(records.pullRequests).toHaveLength(1);
    expect(records.reviewRequests).toHaveLength(2);
    expect(records.repositories).toHaveLength(1);
  });
});
