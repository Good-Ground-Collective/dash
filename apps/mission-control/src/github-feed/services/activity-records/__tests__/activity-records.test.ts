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
