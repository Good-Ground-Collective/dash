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
