import { z } from 'zod';
import type { GithubFeedPullRequest } from '#lib/api/github-feed-contracts.ts';
import { type FeedRow, FeedRows } from '#lib/github-feed/feed-rows.ts';
import {
  type FeedStatus,
  type GithubFeedState,
  GithubFeedView,
} from '#lib/github-feed/feed-view.ts';

const dayMs = 24 * 60 * 60 * 1000;

export const homeFeedPropsSchema = z.object({
  state: z.custom<GithubFeedState>(),
  now: z.date(),
});

export type HomeFeedProps = z.input<typeof homeFeedPropsSchema>;

/** `failed` when Mission Control didn't send the feed. */
export type HomeFeedStatus = FeedStatus | 'failed';

/** The GitHub feed regrouped for Home: what waits on the viewer, and what landed in the last day. */
export class HomeFeed {
  private readonly state: GithubFeedState;
  private readonly now: Date;

  constructor(props: HomeFeedProps) {
    const valid = homeFeedPropsSchema.parse(props);
    this.state = valid.state;
    this.now = valid.now;
  }

  get status(): HomeFeedStatus {
    if (this.state.status === 'failed') return 'failed';
    return new GithubFeedView({ feed: this.state.feed }).status;
  }

  /** Open pull requests waiting on the viewer's review, and the viewer's own open pull requests whose checks fail, newest first. */
  get needsYou(): FeedRow[] {
    if (this.state.status === 'failed') return [];
    const { reviewRequests, myPullRequests } = this.state.feed;

    const reviews = reviewRequests
      .filter((pull) => pull.state === 'open')
      .map((pull) => ({
        ...FeedRows.reviewRequest(pull),
        badges: [{ label: 'Review', tone: 'warn' as const }],
      }));
    const failing = myPullRequests
      .filter(
        (pull) => pull.state === 'open' && pull.checks?.state === 'failure',
      )
      .map((pull) => HomeFeed.failingChecks(pull));

    return HomeFeed.newestFirst([...reviews, ...failing]);
  }

  /** Pull requests the viewer opened or reviewed that merged in the last 24 hours, newest first. */
  get sinceYesterday(): FeedRow[] {
    if (this.state.status === 'failed') return [];
    const { reviewRequests, myPullRequests } = this.state.feed;
    const since = this.now.getTime() - dayMs;

    const merged = new Map<string, FeedRow>();
    for (const pull of [...myPullRequests, ...reviewRequests]) {
      if (pull.state !== 'merged' || pull.updatedAt.getTime() < since) continue;
      merged.set(pull.id, {
        ...FeedRows.reviewRequest(pull),
        badges: [{ label: 'Merged', tone: 'ok' }],
      });
    }
    return HomeFeed.newestFirst([...merged.values()]);
  }

  /** “2 checks failing” is all the row needs to say; the review state waits until CI passes. */
  private static failingChecks(pull: GithubFeedPullRequest): FeedRow {
    const checks = FeedRows.checks(pull.checks);
    return {
      ...FeedRows.myPullRequest(pull),
      badges: checks === null ? [] : [checks],
    };
  }

  private static newestFirst(rows: FeedRow[]): FeedRow[] {
    return rows.toSorted(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }
}
