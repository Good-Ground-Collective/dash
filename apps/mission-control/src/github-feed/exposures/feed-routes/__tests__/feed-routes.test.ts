import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaId,
  fixedNow,
  GithubFeedFixtures,
  graceId,
  guestId,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubFeedHarness } from '#src/github-feed/__tests__/support/github-feed-harness.ts';
import {
  type GithubFeed,
  githubFeedSchema,
} from '#src/github-feed/contracts/github-feed.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';

const running: GithubFeedHarness[] = [];

class Served {
  /** Ada with an owned acme connection read once, as `ada`. */
  static async synced(): Promise<GithubFeedHarness> {
    const harness = await new GithubFeedHarness().link({
      userId: adaId,
      login: 'ada',
    });
    running.push(harness);
    harness.records.add(GithubFeedFixtures.target());
    await harness.module.reconcile.syncConnection({ connectionId: ownedId });
    return harness;
  }

  static async feedOf(
    harness: GithubFeedHarness,
    userId: string,
  ): Promise<GithubFeed> {
    const response = await (
      await harness.start()
    ).inject({
      url: '/integrations/github/feed',
      headers: GithubFeedHarness.cookie(userId),
    });
    expect(response.statusCode).toBe(200);
    return githubFeedSchema.parse(response.json());
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: fixedNow });
});

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (harness) => harness.stop()));
  vi.useRealTimers();
});

describe('GET /integrations/github/feed', () => {
  it('needs a signed-in person', async () => {
    const harness = new GithubFeedHarness();
    running.push(harness);

    const response = await (
      await harness.start()
    ).inject({ url: '/integrations/github/feed' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  });

  it('gives every item its link, repository and connection', async () => {
    const feed = await Served.feedOf(await Served.synced(), adaId);

    expect(feed.reviewRequests[0]).toEqual({
      id: 'PR_1',
      connectionId: ownedId,
      repository: { fullName: 'acme/app', url: 'https://github.com/acme/app' },
      url: 'https://github.com/acme/app/pull/1',
      updatedAt: '2026-11-26T10:00:00.000Z',
      mergedAt: null,
      createdAt: '2026-11-20T08:00:00.000Z',
      number: 1,
      title: 'Change 1',
      author: 'grace',
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      mergeState: 'clean',
      reviewDecision: 'review_required',
      headSha: 'sha1',
      requestedReviewers: [
        { kind: 'user', name: 'ada' },
        { kind: 'team', name: 'platform' },
      ],
      checks: { state: 'failure', success: 3, failure: 1, pending: 0 },
    });
  });

  it('shows nothing of connections another person made', async () => {
    const feed = await Served.feedOf(await Served.synced(), graceId);

    expect(feed).toEqual({
      connections: [],
      reviewRequests: [],
      myPullRequests: [],
      recentMerges: [],
      releases: [],
      failedRuns: [],
      assignedIssues: [],
    });
  });
});

class Reads {
  static merged(mergedAt: string, number = 3) {
    return GithubFeedFixtures.mergedPullRequest({ number, mergedAt });
  }

  static release(id: string, publishedAt: string) {
    return GithubFeedFixtures.release({ id, publishedAt });
  }

  static async activity(
    harness: GithubFeedHarness,
    activity: Partial<ReturnType<typeof GithubFeedFixtures.activity>>,
  ): Promise<void> {
    harness.feed.activity = {
      ...GithubFeedFixtures.activity(),
      ...activity,
    };
    await harness.module.reconcile.syncConnection({
      connectionId: ownedId,
    });
  }
}

describe('GET /integrations/github/feed recent merges and releases', () => {
  it('lists merges and releases by when they happened, newest first, with their own links', async () => {
    const harness = await Served.synced();
    await Reads.activity(harness, {
      mergedPullRequests: [
        Reads.merged('2026-11-26T06:00:00Z', 3),
        Reads.merged('2026-11-26T09:00:00Z', 4),
      ],
      releases: [
        Reads.release('v1.0.0', '2026-11-26T07:00:00Z'),
        Reads.release('v1.1.0', '2026-11-26T08:00:00Z'),
      ],
    });

    const feed = await Served.feedOf(harness, adaId);

    expect(feed.recentMerges.map(({ id }) => id)).toEqual(['PR_4', 'PR_3']);
    expect(feed.recentMerges[0]?.mergedAt).toBe('2026-11-26T09:00:00.000Z');
    expect(feed.releases.map(({ tagName }) => tagName)).toEqual([
      'v1.1.0',
      'v1.0.0',
    ]);
    expect(feed.releases[0]).toMatchObject({
      url: 'https://github.com/acme/app/releases/tag/v1.1.0',
      repository: { fullName: 'acme/app' },
      publishedAt: '2026-11-26T08:00:00.000Z',
    });
    expect(feed.myPullRequests.map(({ id }) => id)).toEqual(['PR_2']);
  });
});

describe('GET /integrations/github/feed retention', () => {
  it('keeps them across a read that no longer reports them', async () => {
    const harness = await Served.synced();
    await Reads.activity(harness, {
      mergedPullRequests: [Reads.merged('2026-11-26T09:00:00Z')],
      releases: [Reads.release('v1.0.0', '2026-11-26T07:00:00Z')],
    });
    vi.setSystemTime(new Date(fixedNow.getTime() + 15 * 60_000));

    await Reads.activity(harness, {});
    const feed = await Served.feedOf(harness, adaId);

    expect(feed.recentMerges.map(({ id }) => id)).toEqual(['PR_3']);
    expect(feed.releases.map(({ tagName }) => tagName)).toEqual(['v1.0.0']);
  });

  it('ages them out 48 hours after they happened', async () => {
    const harness = await Served.synced();
    const mergedAt = '2026-11-26T09:00:00Z';
    await Reads.activity(harness, {
      mergedPullRequests: [Reads.merged(mergedAt)],
      releases: [Reads.release('v1.0.0', mergedAt)],
    });
    const atTheBoundary = new Date(Date.parse(mergedAt) + 48 * 3_600_000);

    vi.setSystemTime(atTheBoundary);
    await Reads.activity(harness, {});
    const kept = await Served.feedOf(harness, adaId);

    vi.setSystemTime(new Date(atTheBoundary.getTime() + 1000));
    await Reads.activity(harness, {});
    const aged = await Served.feedOf(harness, adaId);

    expect(kept.recentMerges).toHaveLength(1);
    expect(kept.releases).toHaveLength(1);
    expect(aged.recentMerges).toEqual([]);
    expect(aged.releases).toEqual([]);
  });
});

describe('GET /integrations/github/feed releases deleted on GitHub', () => {
  it('drops the release of a repository the read saw empty, and keeps an unread repository’s and a merge', async () => {
    const harness = await Served.synced();
    const other = {
      ...GithubFeedFixtures.activity().repositories[0]!,
      externalId: 'R_other',
      fullName: 'acme/other',
      url: 'https://github.com/acme/other',
    };
    const repositories = [...GithubFeedFixtures.activity().repositories, other];
    await Reads.activity(harness, {
      repositories,
      mergedPullRequests: [Reads.merged('2026-11-26T09:00:00Z')],
      releases: [
        Reads.release('v1.0.0', '2026-11-26T07:00:00Z'),
        {
          ...Reads.release('other-v1.0.0', '2026-11-26T07:30:00Z'),
          repositoryId: 'R_other',
        },
      ],
    });
    vi.setSystemTime(new Date(fixedNow.getTime() + 15 * 60_000));

    await Reads.activity(harness, {
      repositories,
      releases: [],
      releaseReads: [
        {
          repositoryId: 'R_app',
          exhaustive: true,
          oldestPublishedAt: null,
        },
      ],
    });
    const feed = await Served.feedOf(harness, adaId);

    expect(feed.releases.map(({ tagName }) => tagName)).toEqual([
      'other-v1.0.0',
    ]);
    expect(feed.recentMerges.map(({ id }) => id)).toEqual(['PR_3']);
  });
});

describe('GET /integrations/github/feed across connection kinds', () => {
  it('answers the same shape for a guest connection’s rows as for an owned one’s', async () => {
    const owned = await Served.feedOf(await Served.synced(), adaId);
    const harness = await new GithubFeedHarness().link({
      userId: adaId,
      login: 'ada',
    });
    running.push(harness);
    harness.records.add(
      GithubFeedFixtures.target({
        connectionId: guestId,
        kind: 'guest',
        installationId: null,
      }),
    );
    await harness.records.replace({
      connectionId: guestId,
      viewerLogin: 'ada',
      records: ActivityRecords.from({
        activity: GithubFeedFixtures.activity(),
        viewerLogin: 'ada',
      }),
      releaseReads: [],
      truncated: false,
      syncedAt: fixedNow,
    });

    const guest = await Served.feedOf(harness, adaId);

    expect(guest.connections).toEqual([
      expect.objectContaining({ id: guestId, kind: 'guest' }),
    ]);
    expect(guest.failedRuns[0]?.connectionId).toBe(guestId);
    expect(GithubFeedFixtures.comparable(guest)).toEqual(
      GithubFeedFixtures.comparable(owned),
    );
  });
});

describe('GET /integrations/github/feed connection freshness', () => {
  it('answers the four groups and the connection’s freshness', async () => {
    const feed = await Served.feedOf(await Served.synced(), adaId);

    expect(feed.connections).toEqual([
      {
        id: ownedId,
        accountLogin: 'acme',
        kind: 'owned',
        lastSyncedAt: fixedNow.toISOString(),
        lastError: null,
        truncated: false,
      },
    ]);
    expect(feed.reviewRequests.map(({ id }) => id)).toEqual(['PR_1']);
    expect(feed.myPullRequests.map(({ id }) => id)).toEqual(['PR_2']);
    expect(feed.failedRuns.map(({ id }) => id)).toEqual(['WFR_9']);
    expect(feed.assignedIssues.map(({ id }) => id)).toEqual(['I_5']);
  });

  it('says when the last read was cut short by a cap', async () => {
    const harness = await new GithubFeedHarness().link({
      userId: adaId,
      login: 'ada',
    });
    running.push(harness);
    harness.records.add(GithubFeedFixtures.target());
    harness.feed.activity = {
      ...GithubFeedFixtures.activity(),
      truncated: true,
    };
    await harness.module.reconcile.syncConnection({ connectionId: ownedId });

    const feed = await Served.feedOf(harness, adaId);

    expect(feed.connections).toEqual([
      expect.objectContaining({ id: ownedId, truncated: true }),
    ]);
  });
});
