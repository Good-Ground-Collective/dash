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
      .map((pull) => HomeFeed.reviewWaiting(pull));
    const failing = myPullRequests
      .filter(
        (pull) => pull.state === 'open' && pull.checks?.state === 'failure',
      )
      .map((pull) => HomeFeed.failingChecks(pull));

    return HomeFeed.newestFirst([...reviews, ...failing]);
  }

  /** The viewer's pull requests merged and the releases published in the past 24 hours, by when they happened, newest first. */
  get sinceYesterday(): FeedRow[] {
    if (this.state.status === 'failed') return [];
    const { recentMerges, releases } = this.state.feed;
    const since = this.now.getTime() - dayMs;

    const merged = recentMerges
      .filter((pull) => (pull.mergedAt?.getTime() ?? 0) >= since)
      .map((pull) => FeedRows.mergedPullRequest(pull));
    const shipped = releases
      .filter((release) => release.publishedAt.getTime() >= since)
      .map((release) => FeedRows.release(release));

    return HomeFeed.newestFirst([...merged, ...shipped]);
  }

  /** Leads with “Review” and keeps the “Draft” badge, so a draft doesn't read as ready to review. */
  private static reviewWaiting(pull: GithubFeedPullRequest): FeedRow {
    const row = FeedRows.reviewRequest(pull);
    return {
      ...row,
      badges: [{ label: 'Review', tone: 'warn' }, ...row.badges],
    };
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
