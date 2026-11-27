import type {
  GithubFeedIssue,
  GithubFeedPullRequest,
  GithubFeedRun,
} from '#lib/api/github-feed-contracts.ts';

export type FeedBadgeTone = 'ok' | 'warn' | 'bad' | 'neutral';

export interface FeedBadge {
  label: string;
  tone: FeedBadgeTone;
}

/** One feed item as a row shows it. Every row opens the item on GitHub. */
export interface FeedRow {
  id: string;
  href: string;
  title: string;
  /** Where it lives, such as “acme/api #42”. */
  context: string;
  /** Such as “by grace”, or `null`. */
  detail: string | null;
  updatedAt: Date;
  badges: FeedBadge[];
}

const reviewBadges = new Map<
  NonNullable<GithubFeedPullRequest['reviewDecision']>,
  FeedBadge
>([
  ['approved', { label: 'Approved', tone: 'ok' }],
  ['changes_requested', { label: 'Changes requested', tone: 'bad' }],
  ['review_required', { label: 'Review required', tone: 'warn' }],
]);

const conclusions = new Map<GithubFeedRun['conclusion'], string>([
  ['failure', 'Failed'],
  ['timed_out', 'Timed out'],
  ['startup_failure', 'Couldn’t start'],
]);

/** Turns feed items into rows. */
export class FeedRows {
  /** A pull request waiting on your review: who opened it, and whether it's a draft. */
  static reviewRequest(pull: GithubFeedPullRequest): FeedRow {
    return {
      ...FeedRows.pullBase(pull),
      detail: FeedRows.byAuthor(pull.author),
      badges: pull.draft ? [{ label: 'Draft', tone: 'neutral' }] : [],
    };
  }

  /** Your own pull request: its review state, conflicts and checks. */
  static myPullRequest(pull: GithubFeedPullRequest): FeedRow {
    const badges: FeedBadge[] = [];
    if (pull.draft) badges.push({ label: 'Draft', tone: 'neutral' });
    const review =
      pull.reviewDecision === null
        ? undefined
        : reviewBadges.get(pull.reviewDecision);
    if (review !== undefined) badges.push(review);
    if (pull.mergeable === 'conflicting') {
      badges.push({ label: 'Conflicts', tone: 'bad' });
    }
    const checks = FeedRows.checks(pull.checks);
    if (checks !== null) badges.push(checks);
    return { ...FeedRows.pullBase(pull), detail: null, badges };
  }

  static failedRun(run: GithubFeedRun): FeedRow {
    return {
      id: run.id,
      href: run.url,
      title: run.workflowName,
      context: `${run.repository.fullName} · ${run.branch}`,
      detail: `Run #${run.runNumber}`,
      updatedAt: run.updatedAt,
      badges: [
        { label: conclusions.get(run.conclusion) ?? 'Failed', tone: 'bad' },
      ],
    };
  }

  static assignedIssue(issue: GithubFeedIssue): FeedRow {
    return {
      id: issue.id,
      href: issue.url,
      title: issue.title,
      context: `${issue.repository.fullName} #${issue.number}`,
      detail: FeedRows.byAuthor(issue.author),
      updatedAt: issue.updatedAt,
      badges: [],
    };
  }

  /** “Checks pass”, “2 checks failing” or “Checks running”, or `null` when the head has none. */
  static checks(checks: GithubFeedPullRequest['checks']): FeedBadge | null {
    if (checks === null) return null;
    if (checks.state === 'failure') {
      const count = Math.max(checks.failure, 1);
      return {
        label: `${count} ${count === 1 ? 'check' : 'checks'} failing`,
        tone: 'bad',
      };
    }
    if (checks.state === 'pending') {
      return { label: 'Checks running', tone: 'warn' };
    }
    return { label: 'Checks pass', tone: 'ok' };
  }

  private static pullBase(
    pull: GithubFeedPullRequest,
  ): Omit<FeedRow, 'detail' | 'badges'> {
    return {
      id: pull.id,
      href: pull.url,
      title: pull.title,
      context: `${pull.repository.fullName} #${pull.number}`,
      updatedAt: pull.updatedAt,
    };
  }

  private static byAuthor(author: string | null): string | null {
    return author === null ? null : `by ${author}`;
  }
}
