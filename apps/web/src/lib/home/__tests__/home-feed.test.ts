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
  ],
  myPullRequests: [
    SampleFeed.pull({
      id: 'mine-red',
      checks: failing,
      updatedAt: Clock.hoursAgo(2),
    }),
    SampleFeed.pull({ id: 'mine-green', checks: passing }),
    SampleFeed.pull({ id: 'mine-no-checks' }),
    SampleFeed.pull({ id: 'mine-closed', state: 'closed' }),
  ],
  recentMerges: [
    SampleFeed.pull({
      id: 'merged-3h-ago',
      state: 'merged',
      mergedAt: Clock.hoursAgo(3),
      updatedAt: Clock.hoursAgo(1),
    }),
    SampleFeed.pull({
      id: 'merged-yesterday-morning',
      state: 'merged',
      mergedAt: Clock.hoursAgo(30),
      updatedAt: Clock.hoursAgo(2),
    }),
  ],
  releases: [
    SampleFeed.release({
      id: 'release-5h-ago',
      publishedAt: Clock.hoursAgo(5),
    }),
    SampleFeed.release({
      id: 'release-two-days-ago',
      publishedAt: Clock.hoursAgo(47),
    }),
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
  it('lists merges and releases from the last 24 hours by when they happened, newest first', () => {
    expect(loaded.sinceYesterday.map((row) => row.id)).toEqual([
      'merged-3h-ago',
      'release-5h-ago',
    ]);
  });

  it('times a merge by its merge, not by later activity on the pull request', () => {
    const [merge] = loaded.sinceYesterday;

    expect(merge?.updatedAt).toEqual(Clock.hoursAgo(3));
    expect(merge?.badges).toEqual([{ label: 'Merged', tone: 'ok' }]);
  });

  it('links a release to the release itself', () => {
    const release = loaded.sinceYesterday.find(
      (row) => row.id === 'release-5h-ago',
    );

    expect(release).toMatchObject({
      href: 'https://github.com/acme-labs/api/releases/tag/v1.2.0',
      title: 'API 1.2.0',
      context: 'acme-labs/api · v1.2.0',
      badges: [{ label: 'Shipped', tone: 'ok' }],
    });
  });
});

describe('HomeFeed sinceYesterday edges', () => {
  it('includes an item just inside the 24 hours and leaves one just outside', () => {
    const home = new HomeFeed({
      state: {
        status: 'loaded',
        feed: SampleFeed.feed({
          connections: [SampleFeed.connection()],
          recentMerges: [
            SampleFeed.pull({
              id: 'inside',
              state: 'merged',
              mergedAt: Clock.hoursAgo(24),
            }),
            SampleFeed.pull({
              id: 'outside',
              state: 'merged',
              mergedAt: new Date(Clock.hoursAgo(24).getTime() - 1),
            }),
          ],
        }),
      },
      now,
    });

    expect(home.sinceYesterday.map((row) => row.id)).toEqual(['inside']);
  });

  it('marks a pre-release as one', () => {
    const home = new HomeFeed({
      state: {
        status: 'loaded',
        feed: SampleFeed.feed({
          connections: [SampleFeed.connection()],
          releases: [
            SampleFeed.release({
              prerelease: true,
              name: null,
              publishedAt: Clock.hoursAgo(1),
            }),
          ],
        }),
      },
      now,
    });

    expect(home.sinceYesterday[0]).toMatchObject({
      title: 'v1.2.0',
      badges: [
        { label: 'Shipped', tone: 'ok' },
        { label: 'Pre-release', tone: 'neutral' },
      ],
    });
  });
});
