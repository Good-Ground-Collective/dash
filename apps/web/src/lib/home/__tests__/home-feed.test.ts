import { describe, expect, it } from 'vitest';
import { SampleFeed } from '#lib/github-feed/__tests__/support/sample-feed.ts';
import { HomeFeed } from '#lib/home/home-feed.ts';

const now = new Date('2026-11-27T12:00:00Z');
class Clock {
  static hoursAgo(hours: number): Date {
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  }
}

const failing = {
  state: 'failure',
  success: 3,
  failure: 2,
  pending: 0,
} as const;
const passing = {
  state: 'success',
  success: 5,
  failure: 0,
  pending: 0,
} as const;

const feed = SampleFeed.feed({
  connections: [SampleFeed.connection()],
  reviewRequests: [
    SampleFeed.pull({ id: 'review-old', updatedAt: Clock.hoursAgo(30) }),
    SampleFeed.pull({ id: 'review-new', updatedAt: Clock.hoursAgo(1) }),
    SampleFeed.pull({
      id: 'reviewed-merged',
      state: 'merged',
      updatedAt: Clock.hoursAgo(5),
    }),
  ],
  myPullRequests: [
    SampleFeed.pull({
      id: 'mine-red',
      checks: failing,
      updatedAt: Clock.hoursAgo(2),
    }),
    SampleFeed.pull({ id: 'mine-green', checks: passing }),
    SampleFeed.pull({ id: 'mine-no-checks' }),
    SampleFeed.pull({
      id: 'mine-merged',
      state: 'merged',
      checks: failing,
      updatedAt: Clock.hoursAgo(3),
    }),
    SampleFeed.pull({
      id: 'mine-merged-last-week',
      state: 'merged',
      updatedAt: Clock.hoursAgo(24 * 7),
    }),
    SampleFeed.pull({ id: 'mine-closed', state: 'closed' }),
  ],
  failedRuns: [SampleFeed.run()],
});

const loaded = new HomeFeed({ state: { status: 'loaded', feed }, now });

describe('HomeFeed status', () => {
  it('is failed when Mission Control sent no feed', () => {
    const home = new HomeFeed({ state: { status: 'failed' }, now });

    expect(home.status).toBe('failed');
    expect(home.needsYou).toEqual([]);
    expect(home.sinceYesterday).toEqual([]);
  });

  it('follows the feed once it loaded', () => {
    const empty = new HomeFeed({
      state: {
        status: 'loaded',
        feed: SampleFeed.feed({ connections: [] }),
      },
      now,
    });

    expect(empty.status).toBe('not-connected');
    expect(loaded.status).toBe('ready');
  });
});

describe('HomeFeed needsYou', () => {
  it('lists open review requests and the viewer’s open pull requests with failing checks, newest first', () => {
    expect(loaded.needsYou.map((row) => row.id)).toEqual([
      'review-new',
      'mine-red',
      'review-old',
    ]);
  });

  it('labels each row with why it needs the viewer', () => {
    const [review, red] = loaded.needsYou;

    expect(review?.badges).toEqual([{ label: 'Review', tone: 'warn' }]);
    expect(red?.badges).toEqual([{ label: '2 checks failing', tone: 'bad' }]);
    expect(red?.href).toBe('https://github.com/acme-labs/api/pull/42');
  });

  it('keeps the Draft badge on a draft review request', () => {
    const home = new HomeFeed({
      state: {
        status: 'loaded',
        feed: SampleFeed.feed({
          connections: [SampleFeed.connection()],
          reviewRequests: [SampleFeed.pull({ id: 'draft', draft: true })],
        }),
      },
      now,
    });

    expect(home.needsYou[0]?.badges).toEqual([
      { label: 'Review', tone: 'warn' },
      { label: 'Draft', tone: 'neutral' },
    ]);
  });

  it('is empty when nothing waits on the viewer', () => {
    const quiet = new HomeFeed({
      state: {
        status: 'loaded',
        feed: SampleFeed.feed({ connections: [SampleFeed.connection()] }),
      },
      now,
    });

    expect(quiet.needsYou).toEqual([]);
  });
});

describe('HomeFeed sinceYesterday', () => {
  it('lists pull requests merged in the last 24 hours, newest first', () => {
    expect(loaded.sinceYesterday.map((row) => row.id)).toEqual([
      'mine-merged',
      'reviewed-merged',
    ]);
    expect(loaded.sinceYesterday[0]?.badges).toEqual([
      { label: 'Merged', tone: 'ok' },
    ]);
  });

  it('shows a pull request once when it is both the viewer’s and a review request', () => {
    const both = SampleFeed.pull({
      id: 'both',
      state: 'merged',
      updatedAt: Clock.hoursAgo(1),
    });
    const home = new HomeFeed({
      state: {
        status: 'loaded',
        feed: SampleFeed.feed({
          connections: [SampleFeed.connection()],
          reviewRequests: [both],
          myPullRequests: [both],
        }),
      },
      now,
    });

    expect(home.sinceYesterday.map((row) => row.id)).toEqual(['both']);
  });
});
