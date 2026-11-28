import { expect } from 'vitest';

import {
  adaId,
  GithubFeedFixtures,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubFeedHarness } from '#src/github-feed/__tests__/support/github-feed-harness.ts';
import {
  type GithubFeed,
  githubFeedSchema,
} from '#src/github-feed/contracts/github-feed.ts';

const runningHarnesses: GithubFeedHarness[] = [];

/** Ada's feed as the route serves it, read from a harness that is stopped after each test. */
export class ServedGithubFeed {
  static track(harness: GithubFeedHarness): void {
    runningHarnesses.push(harness);
  }

  static async stopAll(): Promise<void> {
    await Promise.all(
      runningHarnesses.splice(0).map(async (harness) => harness.stop()),
    );
  }

  /** Ada with an owned acme connection read once, as `ada`. */
  static async synced(): Promise<GithubFeedHarness> {
    const harness = await new GithubFeedHarness().link({
      userId: adaId,
      login: 'ada',
    });
    ServedGithubFeed.track(harness);
    harness.records.add(GithubFeedFixtures.target());
    await harness.module.reconcile.syncConnection({ connectionId: ownedId });
    return harness;
  }

  /** Reads the connection again, as the provider now reports `activity` over the usual fixture. */
  static async reread(
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
