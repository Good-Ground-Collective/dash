import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('GithubFeedView groups', () => {
  it('lists the four groups in order, newest first', () => {
    const view = new GithubFeedView({ feed });

    expect(view.groups.map((group) => group.title)).toEqual([
      'Review requests',
      'My pull requests',
      'Failed runs',
      'Assigned issues',
    ]);
    expect(view.groups[0]?.rows.map((row) => row.id)).toEqual([
      'night',
      'new',
      'old',
    ]);
    expect(view.groups[1]?.rows).toEqual([]);
    expect(view.groups[1]?.empty).toBe('You have no open pull requests.');
  });

  it('narrows every group to one account, ignoring case', () => {
    const view = new GithubFeedView({ feed, account: 'Night-Shift' });

    expect(view.account).toBe('night-shift');
    expect(view.unknownAccount).toBeNull();
    expect(view.groups.map((group) => group.rows.length)).toEqual([1, 0, 1, 0]);
    expect(view.connectionStatuses.map((status) => status.login)).toEqual([
      'night-shift',
    ]);
  });

  it('shows everything and names the account when no connection has that login', () => {
    const view = new GithubFeedView({ feed, account: 'nobody' });

    expect(view.account).toBeNull();
    expect(view.unknownAccount).toBe('nobody');
    expect(view.groups.map((group) => group.rows.length)).toEqual([3, 0, 1, 1]);
  });

  it('treats an empty account as no filter', () => {
    const view = new GithubFeedView({ feed, account: '  ' });

    expect(view.unknownAccount).toBeNull();
    expect(view.account).toBeNull();
  });
});

describe('GithubFeedView accountOptions', () => {
  it('offers all accounts, then each login as a link that keeps the choice', () => {
    const view = new GithubFeedView({ feed, account: 'acme-labs' });

    expect(view.accountOptions).toEqual([
      { label: 'All accounts', href: '/github', current: false },
      { label: 'acme-labs', href: '/github?account=acme-labs', current: true },
      {
        label: 'night-shift',
        href: '/github?account=night-shift',
        current: false,
      },
    ]);
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
    });
    expect(GithubFeedView.statusOf(night)).toMatchObject({
      synced: 'Synced 3 hours ago',
      stale: true,
      error: 'GitHub rate-limited the read.',
    });
  });

  it('says the first sync is in progress before any read', () => {
    expect(
      GithubFeedView.statusOf(SampleFeed.connection({ lastSyncedAt: null })),
    ).toMatchObject({ synced: 'First sync in progress', stale: false });
  });
});
