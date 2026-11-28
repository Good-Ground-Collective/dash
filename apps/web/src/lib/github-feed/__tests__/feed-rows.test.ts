import { describe, expect, it } from 'vitest';
import { FeedRows } from '#lib/github-feed/feed-rows.ts';
import { SampleFeed } from './support/sample-feed.ts';

describe('FeedRows.reviewRequest', () => {
  it('links to the pull request and names its author', () => {
    expect(FeedRows.reviewRequest(SampleFeed.pull())).toEqual({
      id: 'PR_1',
      href: 'https://github.com/acme-labs/api/pull/42',
      title: 'Add rate limits',
      context: 'acme-labs/api #42',
      detail: 'by grace',
      updatedAt: new Date('2026-11-27T10:00:00Z'),
      badges: [],
    });
  });

  it('marks a draft and leaves out a missing author', () => {
    const row = FeedRows.reviewRequest(
      SampleFeed.pull({ draft: true, author: null }),
    );

    expect(row.detail).toBeNull();
    expect(row.badges).toEqual([{ label: 'Draft', tone: 'neutral' }]);
  });
});

describe('FeedRows.reviewRequestWithChecks', () => {
  it('adds the checks state after the draft badge', () => {
    const row = FeedRows.reviewRequestWithChecks(
      SampleFeed.pull({
        draft: true,
        checks: { state: 'pending', success: 1, failure: 0, pending: 2 },
      }),
    );

    expect(row.badges).toEqual([
      { label: 'Draft', tone: 'neutral' },
      { label: 'Checks running', tone: 'warn' },
    ]);
  });

  it('leaves badges alone when the head has no checks', () => {
    expect(FeedRows.reviewRequestWithChecks(SampleFeed.pull()).badges).toEqual(
      [],
    );
  });
});

describe('FeedRows.myPullRequest', () => {
  it('shows review state, conflicts and checks in that order', () => {
    const row = FeedRows.myPullRequest(
      SampleFeed.pull({
        draft: true,
        reviewDecision: 'changes_requested',
        mergeable: 'conflicting',
        checks: { state: 'failure', success: 3, failure: 2, pending: 0 },
      }),
    );

    expect(row.badges).toEqual([
      { label: 'Draft', tone: 'neutral' },
      { label: 'Changes requested', tone: 'bad' },
      { label: 'Conflicts', tone: 'bad' },
      { label: '2 checks failing', tone: 'bad' },
    ]);
  });

  it('shows nothing extra for a pull request without review rules or checks', () => {
    expect(FeedRows.myPullRequest(SampleFeed.pull()).badges).toEqual([]);
  });

  it.each([
    ['approved', 'Approved', 'ok'],
    ['review_required', 'Review required', 'warn'],
  ] as const)('reads %s as “%s”', (decision, label, tone) => {
    const row = FeedRows.myPullRequest(
      SampleFeed.pull({ reviewDecision: decision }),
    );

    expect(row.badges).toEqual([{ label, tone }]);
  });
});

describe('FeedRows.checks', () => {
  it.each([
    [{ state: 'success', success: 4, failure: 0, pending: 0 }, 'Checks pass'],
    [
      { state: 'pending', success: 1, failure: 0, pending: 2 },
      'Checks running',
    ],
    [
      { state: 'failure', success: 1, failure: 1, pending: 0 },
      '1 check failing',
    ],
    [
      { state: 'failure', success: 0, failure: 0, pending: 0 },
      '1 check failing',
    ],
  ] as const)('reads %o as “%s”', (checks, label) => {
    expect(FeedRows.checks(checks)?.label).toBe(label);
  });

  it('is null when the head has no checks', () => {
    expect(FeedRows.checks(null)).toBeNull();
  });
});

describe('FeedRows.failedRun', () => {
  it('names the workflow, branch and run number', () => {
    expect(
      FeedRows.failedRun(SampleFeed.run({ conclusion: 'timed_out' })),
    ).toEqual({
      id: 'RUN_1',
      href: 'https://github.com/acme-labs/api/actions/runs/9',
      title: 'CI',
      context: 'acme-labs/api · main',
      detail: 'Run #9',
      updatedAt: new Date('2026-11-27T09:00:00Z'),
      badges: [{ label: 'Timed out', tone: 'bad' }],
    });
  });
});

describe('FeedRows.assignedIssue', () => {
  it('links to the issue and names its author', () => {
    const row = FeedRows.assignedIssue(SampleFeed.issue());

    expect(row.href).toBe('https://github.com/acme-labs/web/issues/7');
    expect(row.context).toBe('acme-labs/web #7');
    expect(row.detail).toBe('by linus');
  });
});
