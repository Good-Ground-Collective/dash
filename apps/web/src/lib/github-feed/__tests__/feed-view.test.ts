import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubFeedPullRequest } from '#lib/api/github-feed-contracts.ts';
import { GithubFeedView } from '#lib/github-feed/feed-view.ts';
import { SampleFeed } from './support/sample-feed.ts';

const acme = SampleFeed.connection();
const night = SampleFeed.connection({
  id: 'c-night',
  accountLogin: 'night-shift',
  lastSyncedAt: new Date('2026-11-27T09:00:00Z'),
  lastError: 'GitHub rate-limited the read.',
});

const feed = SampleFeed.feed({
  connections: [acme, night],
  reviewRequests: [
    SampleFeed.pull({ id: 'old', updatedAt: new Date('2026-11-20') }),
    SampleFeed.pull({ id: 'new', updatedAt: new Date('2026-11-26') }),
    SampleFeed.pull({ id: 'night', connectionId: 'c-night' }),
  ],
  failedRuns: [SampleFeed.run({ connectionId: 'c-night' })],
  assignedIssues: [SampleFeed.issue()],
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GithubFeedView status', () => {
  it('is not-connected with no connections', () => {
    const view = new GithubFeedView({
      feed: SampleFeed.feed({ connections: [] }),
    });

    expect(view.status).toBe('not-connected');
  });

  it('is first-sync while no connection has been read', () => {
    const view = new GithubFeedView({
      feed: SampleFeed.feed({
        connections: [SampleFeed.connection({ lastSyncedAt: null })],
      }),
    });

    expect(view.status).toBe('first-sync');
  });

  it('is ready once any connection has been read', () => {
    const view = new GithubFeedView({
      feed: SampleFeed.feed({
        connections: [
          acme,
          SampleFeed.connection({ id: 'x', lastSyncedAt: null }),
        ],
      }),
    });

    expect(view.status).toBe('ready');
  });

  it('is first-sync when the filtered account has not been read yet', () => {
    const fresh = SampleFeed.connection({
      id: 'c-fresh',
      accountLogin: 'fresh-org',
      lastSyncedAt: null,
    });
    const both = SampleFeed.feed({ connections: [acme, fresh] });

    expect(
      new GithubFeedView({ feed: both, account: 'fresh-org' }).status,
    ).toBe('first-sync');
    expect(new GithubFeedView({ feed: both }).status).toBe('ready');
  });
});

describe('GithubFeedView tab bodies', () => {
  it('lists review requests oldest first by created time, with each checks state', () => {
    const failing = {
      state: 'failure',
      success: 1,
      failure: 1,
      pending: 0,
    } as const;
    const view = new GithubFeedView({
      feed: SampleFeed.feed({
        reviewRequests: [
          SampleFeed.pull({ id: 'recent', createdAt: new Date('2026-11-26') }),
          SampleFeed.pull({
            id: 'oldest',
            createdAt: new Date('2026-11-01'),
            updatedAt: new Date('2026-11-27T11:00:00Z'),
            checks: failing,
          }),
        ],
      }),
    });

    expect(view.groups[0]?.rows.map((row) => row.id)).toEqual([
      'oldest',
      'recent',
    ]);
    expect(view.groups[0]?.rows[0]?.badges).toEqual([
      { label: '1 check failing', tone: 'bad' },
    ]);
  });

  it('titles My PRs groups in order, hiding empty ones, or shows one empty card', () => {
    const mine = (pulls: GithubFeedPullRequest[]): string[] =>
      new GithubFeedView({
        feed: SampleFeed.feed({ myPullRequests: pulls }),
        tab: 'mine',
      }).groups.map((group) => group.title);

    expect(
      mine([
        SampleFeed.pull({ id: 'a', mergeState: 'blocked' }),
        SampleFeed.pull({ id: 'b' }),
        SampleFeed.pull({ id: 'c', reviewDecision: 'changes_requested' }),
      ]),
    ).toEqual(['Changes requested', 'Ready to merge', 'Waiting on review']);
    expect(mine([])).toEqual(['My pull requests']);
  });

  it('lists assigned issues, newest first', () => {
    const view = new GithubFeedView({
      feed: SampleFeed.feed({
        assignedIssues: [
          SampleFeed.issue({ id: 'a', updatedAt: new Date('2026-11-01') }),
          SampleFeed.issue({ id: 'b', updatedAt: new Date('2026-11-02') }),
        ],
      }),
      tab: 'assigned',
    });

    expect(view.groups[0]?.title).toBe('Assigned issues');
    expect(view.groups[0]?.rows.map((row) => row.id)).toEqual(['b', 'a']);
  });
});

describe('GithubFeedView account filter', () => {
  it('narrows every tab to one account, ignoring case', () => {
    const view = new GithubFeedView({ feed, account: 'Night-Shift' });

    expect(view.account).toBe('night-shift');
    expect(view.unknownAccount).toBeNull();
    expect(view.tabs.map((tab) => tab.count)).toEqual([1, 0, 0]);
    expect(view.connectionStatuses.map((status) => status.login)).toEqual([
      'night-shift',
    ]);
  });

  it('shows everything and names the account when no connection has that login', () => {
    const view = new GithubFeedView({ feed, account: 'nobody' });

    expect(view.account).toBeNull();
    expect(view.unknownAccount).toBe('nobody');
    expect(view.tabs.map((tab) => tab.count)).toEqual([3, 0, 1]);
  });

  it('treats an empty account as no filter', () => {
    const view = new GithubFeedView({ feed, account: '  ' });

    expect(view.unknownAccount).toBeNull();
    expect(view.account).toBeNull();
  });
});

describe('GithubFeedView tabs', () => {
  it('offers each tab with its count, and the account filter kept in every link', () => {
    const view = new GithubFeedView({
      feed,
      account: 'acme-labs',
      tab: 'assigned',
    });

    expect(view.tabs).toEqual([
      {
        key: 'review',
        label: 'Review requests',
        count: 2,
        href: '/github?account=acme-labs&tab=review',
        current: false,
      },
      {
        key: 'mine',
        label: 'My PRs',
        count: 0,
        href: '/github?account=acme-labs&tab=mine',
        current: false,
      },
      {
        key: 'assigned',
        label: 'Assigned',
        count: 1,
        href: '/github?account=acme-labs&tab=assigned',
        current: true,
      },
    ]);
  });

  it('defaults to review for a missing or unknown tab', () => {
    expect(new GithubFeedView({ feed }).tab).toBe('review');
    expect(new GithubFeedView({ feed, tab: 'ci' }).tab).toBe('review');
    expect(new GithubFeedView({ feed, tab: null }).tab).toBe('review');
  });

  it('builds the tab links without an account when none is chosen', () => {
    const view = new GithubFeedView({ feed });

    expect(view.tabs.map((tab) => tab.href)).toEqual([
      '/github?tab=review',
      '/github?tab=mine',
      '/github?tab=assigned',
    ]);
  });
});

describe('GithubFeedView freshness', () => {
  it('counts accounts and reads the most recent successful sync', () => {
    expect(new GithubFeedView({ feed }).freshness).toBe(
      '2 accounts · reconciled 5 minutes ago',
    );
  });

  it('covers every connected account whatever the account filter', () => {
    const view = new GithubFeedView({ feed, account: 'night-shift' });

    expect(view.connections).toHaveLength(1);
    expect(view.freshness).toBe('2 accounts · reconciled 5 minutes ago');
  });

  it('says so before any connection has been read', () => {
    const view = new GithubFeedView({
      feed: SampleFeed.feed({
        connections: [SampleFeed.connection({ lastSyncedAt: null })],
      }),
    });

    expect(view.freshness).toBe('1 account · not reconciled yet');
  });
});

describe('GithubFeedView accountOptions', () => {
  it('offers all accounts, then each login as a link that keeps the choice and the tab', () => {
    const view = new GithubFeedView({
      feed,
      account: 'acme-labs',
      tab: 'mine',
    });

    expect(view.accountOptions).toEqual([
      { label: 'All accounts', href: '/github?tab=mine', current: false },
      {
        label: 'acme-labs',
        href: '/github?account=acme-labs&tab=mine',
        current: true,
      },
      {
        label: 'night-shift',
        href: '/github?account=night-shift&tab=mine',
        current: false,
      },
    ]);
    expect(view.clearAccountHref).toBe('/github?tab=mine');
  });
});

describe('GithubFeedView.statusOf', () => {
  it('reads freshness, staleness and the last error', () => {
    expect(GithubFeedView.statusOf(acme)).toEqual({
      id: 'c-acme',
      login: 'acme-labs',
      kind: 'owned',
      synced: 'Synced 5 minutes ago',
      stale: false,
      error: null,
      truncated: false,
    });
    expect(GithubFeedView.statusOf(night)).toMatchObject({
      synced: 'Synced 3 hours ago',
      stale: true,
      error: 'GitHub rate-limited the read.',
    });
  });

  it('marks a connection whose last read hit a cap as truncated', () => {
    expect(
      GithubFeedView.statusOf(SampleFeed.connection({ truncated: true })),
    ).toMatchObject({ truncated: true });
    expect(
      GithubFeedView.statusOf(SampleFeed.connection({ truncated: null })),
    ).toMatchObject({ truncated: false });
  });

  it('says the first sync is in progress before any read', () => {
    expect(
      GithubFeedView.statusOf(SampleFeed.connection({ lastSyncedAt: null })),
    ).toMatchObject({ synced: 'First sync in progress', stale: false });
  });
});
