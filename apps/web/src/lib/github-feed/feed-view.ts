import { z } from 'zod';
import type {
  GithubFeed,
  GithubFeedConnection,
} from '#lib/api/github-feed-contracts.ts';
import { type FeedRow, FeedRows } from '#lib/github-feed/feed-rows.ts';
import {
  type MyPullGroupKey,
  myPullGroupKeys,
  MyPullGroups,
} from '#lib/github-feed/my-pull-groups.ts';
import { RelativeTime } from '#lib/github-feed/relative-time.ts';

export const githubPagePath = '/github';
export const accountParam = 'account';

/** Mission Control reads every 15 minutes, so an hour without a read means something is wrong. */
const staleAfterMinutes = 60;

export const tabParam = 'tab';

/** The tabs the page offers, in order. A tab is one entry here and one entry in `tabCopy`. */
export const githubTabKeys = ['review', 'mine', 'assigned'] as const;
export type GithubTabKey = (typeof githubTabKeys)[number];
export const defaultTab: GithubTabKey = 'review';

export type FeedGroupKey =
  'reviewRequests' | MyPullGroupKey | 'myPullRequests' | 'assignedIssues';

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
  /** The last good read hit a cap, so only the most recent items are shown. */
  truncated: boolean;
}

export interface AccountFilterOption {
  label: string;
  href: string;
  current: boolean;
}

export interface GithubTab {
  key: GithubTabKey;
  label: string;
  count: number;
  href: string;
  current: boolean;
}

const tabCopy = {
  review: 'Review requests',
  mine: 'My PRs',
  assigned: 'Assigned',
} satisfies Record<GithubTabKey, string>;

const groupCopy = {
  reviewRequests: {
    title: 'Review requests',
    empty: 'Nothing is waiting on your review.',
  },
  changesRequested: {
    title: 'Changes requested',
    empty: 'No pull requests have changes requested.',
  },
  checksFailing: {
    title: 'Checks failing',
    empty: 'No pull requests have failing checks.',
  },
  readyToMerge: {
    title: 'Ready to merge',
    empty: 'No pull requests are ready to merge.',
  },
  waitingOnReview: {
    title: 'Waiting on review',
    empty: 'No pull requests are waiting on review.',
  },
  myPullRequests: {
    title: 'My pull requests',
    empty: 'You have no open pull requests.',
  },
  assignedIssues: {
    title: 'Assigned issues',
    empty: 'No open issues are assigned to you.',
  },
} satisfies Record<FeedGroupKey, Omit<FeedGroup, 'rows' | 'key'>>;

export const githubFeedViewPropsSchema = z.object({
  feed: z.custom<GithubFeed>(),
  account: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (value === '' ? null : value))
    .nullish()
    .transform((value) => value ?? null),
  tab: z.string().nullish().pipe(z.enum(githubTabKeys).catch(defaultTab)),
});

export type GithubFeedViewProps = z.input<typeof githubFeedViewPropsSchema>;

/** The feed as the home panel and the GitHub page show it, narrowed to one account when `account` names one. */
export class GithubFeedView {
  readonly connections: readonly GithubFeedConnection[];
  readonly account: string | null;
  readonly tab: GithubTabKey;
  /** The `account` asked for when no connection has that login, so the view shows everything. */
  readonly unknownAccount: string | null;
  private readonly feed: GithubFeed;

  constructor(props: GithubFeedViewProps) {
    const valid = githubFeedViewPropsSchema.parse(props);
    this.feed = valid.feed;
    this.tab = valid.tab;
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

  /** “2 accounts · reconciled 4 minutes ago”, covering every connected account whatever the `account` filter, from the most recent successful read of any connection. The connection list below the header still flags a stale one. */
  get freshness(): string {
    const accounts = new Set(
      this.feed.connections.map((connection) => connection.accountLogin),
    ).size;
    const noun = accounts === 1 ? 'account' : 'accounts';
    const reconciled = this.reconciledAt;
    return `${accounts} ${noun} · ${
      reconciled === null
        ? 'not reconciled yet'
        : `reconciled ${RelativeTime.since(reconciled)}`
    }`;
  }

  /** One link per tab with its count, each keeping the account filter in the URL. */
  get tabs(): GithubTab[] {
    return githubTabKeys.map((key) => ({
      key,
      label: tabCopy[key],
      count: this.rowCount(key),
      href: this.href({ tab: key }),
      current: this.tab === key,
    }));
  }

  /** The groups the active tab shows. Empty My PRs groups are left out, unless all are, which leaves one empty card. */
  get groups(): FeedGroup[] {
    const groups = this.groupsOf(this.tab);
    if (this.tab !== 'mine') return groups;

    const filled = groups.filter((group) => group.rows.length > 0);
    return filled.length > 0
      ? filled
      : [{ key: 'myPullRequests', ...groupCopy.myPullRequests, rows: [] }];
  }

  /** Where the page goes with no account filter, on the same tab. */
  get clearAccountHref(): string {
    return this.href({ account: null });
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
        href: this.href({ account: null }),
        current: this.account === null,
      },
      ...logins.map((login) => ({
        label: login,
        href: this.href({ account: login }),
        current: this.account === login,
      })),
    ];
  }

  private get reconciledAt(): Date | null {
    const times = this.feed.connections.flatMap((connection) =>
      connection.lastSyncedAt === null ? [] : [connection.lastSyncedAt],
    );
    return times.length === 0
      ? null
      : new Date(Math.max(...times.map((time) => time.getTime())));
  }

  private href(change: {
    tab?: GithubTabKey;
    account?: string | null;
  }): string {
    const account =
      change.account === undefined ? this.account : change.account;
    const params = new URLSearchParams();
    if (account !== null) params.set(accountParam, account);
    params.set(tabParam, change.tab ?? this.tab);
    return `${githubPagePath}?${params.toString()}`;
  }

  private rowCount(tab: GithubTabKey): number {
    return this.groupsOf(tab).reduce(
      (total, group) => total + group.rows.length,
      0,
    );
  }

  private groupsOf(tab: GithubTabKey): FeedGroup[] {
    const ids = new Set(this.connections.map((connection) => connection.id));
    const mine = <T extends { connectionId: string; updatedAt: Date }>(
      items: readonly T[],
    ): T[] =>
      items
        .filter((item) => ids.has(item.connectionId))
        .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const group = (key: FeedGroupKey, rows: FeedRow[]): FeedGroup => ({
      key,
      ...groupCopy[key],
      rows,
    });

    if (tab === 'review') {
      const oldestFirst = this.feed.reviewRequests
        .filter((pull) => ids.has(pull.connectionId))
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return [
        group(
          'reviewRequests',
          oldestFirst.map((pull) => FeedRows.reviewRequestWithChecks(pull)),
        ),
      ];
    }

    if (tab === 'mine') {
      const pulls = MyPullGroups.split(mine(this.feed.myPullRequests));
      return myPullGroupKeys.map((key) =>
        group(
          key,
          pulls[key].map((pull) => FeedRows.myPullRequest(pull)),
        ),
      );
    }

    return [
      group(
        'assignedIssues',
        mine(this.feed.assignedIssues).map((issue) =>
          FeedRows.assignedIssue(issue),
        ),
      ),
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
      truncated: connection.truncated === true,
    };
  }
}
