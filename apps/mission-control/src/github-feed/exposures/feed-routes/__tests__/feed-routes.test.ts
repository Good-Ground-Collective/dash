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

  /** The feed with connection ids and kinds blanked, to compare what each source produced. */
  static comparable(feed: GithubFeed) {
    const item = <T extends { connectionId: string }>(value: T) => ({
      ...value,
      connectionId: 'any',
    });
    return {
      reviewRequests: feed.reviewRequests.map(item),
      myPullRequests: feed.myPullRequests.map(item),
      failedRuns: feed.failedRuns.map(item),
      assignedIssues: feed.assignedIssues.map(item),
    };
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

  it('answers the four groups and the connection’s freshness', async () => {
    const feed = await Served.feedOf(await Served.synced(), adaId);

    expect(feed.connections).toEqual([
      {
        id: ownedId,
        accountLogin: 'acme',
        kind: 'owned',
        lastSyncedAt: fixedNow.toISOString(),
        lastError: null,
      },
    ]);
    expect(feed.reviewRequests.map(({ id }) => id)).toEqual(['PR_1']);
    expect(feed.myPullRequests.map(({ id }) => id)).toEqual(['PR_2']);
    expect(feed.failedRuns.map(({ id }) => id)).toEqual(['WFR_9']);
    expect(feed.assignedIssues.map(({ id }) => id)).toEqual(['I_5']);
  });

  it('gives every item its link, repository and connection', async () => {
    const feed = await Served.feedOf(await Served.synced(), adaId);

    expect(feed.reviewRequests[0]).toEqual({
      id: 'PR_1',
      connectionId: ownedId,
      repository: { fullName: 'acme/app', url: 'https://github.com/acme/app' },
      url: 'https://github.com/acme/app/pull/1',
      updatedAt: '2026-11-26T10:00:00.000Z',
      number: 1,
      title: 'Change 1',
      author: 'grace',
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
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
      failedRuns: [],
      assignedIssues: [],
    });
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
      syncedAt: fixedNow,
    });

    const guest = await Served.feedOf(harness, adaId);

    expect(guest.connections).toEqual([
      expect.objectContaining({ id: guestId, kind: 'guest' }),
    ]);
    expect(guest.failedRuns[0]?.connectionId).toBe(guestId);
    expect(Served.comparable(guest)).toEqual(Served.comparable(owned));
  });
});
