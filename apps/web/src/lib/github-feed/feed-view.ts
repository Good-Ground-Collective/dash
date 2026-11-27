import { z } from 'zod';
import type {
  GithubFeed,
  GithubFeedConnection,
} from '#lib/api/github-feed-contracts.ts';
import { type FeedRow, FeedRows } from '#lib/github-feed/feed-rows.ts';
import { RelativeTime } from '#lib/github-feed/relative-time.ts';

export const githubPagePath = '/github';
export const accountParam = 'account';

/** Mission Control reads every 15 minutes, so an hour without a read means something is wrong. */
const staleAfterMinutes = 60;

export type FeedGroupKey =
  'reviewRequests' | 'myPullRequests' | 'failedRuns' | 'assignedIssues';

export interface FeedGroup {
  key: FeedGroupKey;
  title: string;
  empty: string;
  rows: FeedRow[];
}

/** What a page got from Mission Control: the feed, or `failed` when it didn't answer. */
export type GithubFeedState =
  { status: 'loaded'; feed: GithubFeed } | { status: 'failed' };

/** `not-connected` before any connection, `first-sync` while none has been read yet. */
export type FeedStatus = 'not-connected' | 'first-sync' | 'ready';

export interface ConnectionStatus {
  id: string;
  login: string;
  kind: GithubFeedConnection['kind'];
  /** “Synced 5 minutes ago”, or “First sync in progress”. */
  synced: string;
  stale: boolean;
  error: string | null;
}

export interface AccountFilterOption {
  label: string;
  href: string;
  current: boolean;
}

const groupCopy: readonly Omit<FeedGroup, 'rows'>[] = [
  {
    key: 'reviewRequests',
    title: 'Review requests',
    empty: 'Nothing is waiting on your review.',
  },
  {
    key: 'myPullRequests',
    title: 'My pull requests',
    empty: 'You have no open pull requests.',
  },
  {
    key: 'failedRuns',
    title: 'Failed runs',
    empty: 'No failed runs on your branches or default branches.',
  },
  {
    key: 'assignedIssues',
    title: 'Assigned issues',
    empty: 'No open issues are assigned to you.',
  },
];

export const githubFeedViewPropsSchema = z.object({
  feed: z.custom<GithubFeed>(),
  account: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (value === '' ? null : value))
    .nullish()
    .transform((value) => value ?? null),
});

export type GithubFeedViewProps = z.input<typeof githubFeedViewPropsSchema>;

/** The feed as the home panel and the GitHub page show it, narrowed to one account when `account` names one. */
export class GithubFeedView {
  readonly connections: readonly GithubFeedConnection[];
  readonly account: string | null;
  /** The `account` asked for when no connection has that login, so the view shows everything. */
  readonly unknownAccount: string | null;
  private readonly feed: GithubFeed;

  constructor(props: GithubFeedViewProps) {
    const valid = githubFeedViewPropsSchema.parse(props);
    this.feed = valid.feed;
    const wanted = valid.account;
    const matching = valid.feed.connections.filter(
      (connection) => connection.accountLogin.toLowerCase() === wanted,
    );

    const filtered = wanted !== null && matching.length > 0;
    this.connections = filtered ? matching : valid.feed.connections;
    this.account = filtered ? (matching[0]?.accountLogin ?? null) : null;
    this.unknownAccount = wanted !== null && !filtered ? wanted : null;
  }

  get status(): FeedStatus {
    if (this.feed.connections.length === 0) return 'not-connected';

    const synced = this.connections.some(
      (connection) => connection.lastSyncedAt !== null,
    );
    return synced ? 'ready' : 'first-sync';
  }

  get groups(): FeedGroup[] {
    const ids = new Set(this.connections.map((connection) => connection.id));
    const mine = <T extends { connectionId: string; updatedAt: Date }>(
      items: readonly T[],
    ): T[] =>
      items
        .filter((item) => ids.has(item.connectionId))
        .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const rows = {
      reviewRequests: mine(this.feed.reviewRequests).map((pull) =>
        FeedRows.reviewRequest(pull),
      ),
      myPullRequests: mine(this.feed.myPullRequests).map((pull) =>
        FeedRows.myPullRequest(pull),
      ),
      failedRuns: mine(this.feed.failedRuns).map((run) =>
        FeedRows.failedRun(run),
      ),
      assignedIssues: mine(this.feed.assignedIssues).map((issue) =>
        FeedRows.assignedIssue(issue),
      ),
    } satisfies Record<FeedGroupKey, FeedRow[]>;

    return groupCopy.map((copy) => ({ ...copy, rows: rows[copy.key] }));
  }

  get connectionStatuses(): ConnectionStatus[] {
    return this.connections.map((connection) =>
      GithubFeedView.statusOf(connection),
    );
  }

  /** “All accounts” first, then one link per account login, each keeping the choice in the URL. */
  get accountOptions(): AccountFilterOption[] {
    const logins = [
      ...new Set(this.feed.connections.map((entry) => entry.accountLogin)),
    ].toSorted((a, b) => a.localeCompare(b));
    return [
      {
        label: 'All accounts',
        href: githubPagePath,
        current: this.account === null,
      },
      ...logins.map((login) => ({
        label: login,
        href: `${githubPagePath}?${new URLSearchParams({ [accountParam]: login }).toString()}`,
        current: this.account === login,
      })),
    ];
  }

  static statusOf(connection: GithubFeedConnection): ConnectionStatus {
    const when = connection.lastSyncedAt;
    return {
      id: connection.id,
      login: connection.accountLogin,
      kind: connection.kind,
      synced:
        when === null
          ? 'First sync in progress'
          : `Synced ${RelativeTime.since(when)}`,
      stale:
        when !== null &&
        RelativeTime.olderThan({ when, minutes: staleAfterMinutes }),
      error: connection.lastError,
    };
  }
}
