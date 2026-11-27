import type {
  CheckRollup,
  PullRequest,
  PullRequestQuery,
  Repository,
  Review,
} from '#src/contracts/source-control-records.ts';

/**
 * Reads repositories, pull requests, reviews and checks. Each method returns only what the
 * connection can see, so a connection scoped to one person returns only their work.
 */
export interface SourceControl {
  listRepositories(): Promise<readonly Repository[]>;
  /** Providers parse `query` with `pullRequestQuerySchema`, so an absent state means open pull requests. */
  listPullRequests(query: PullRequestQuery): Promise<readonly PullRequest[]>;
  /** Submitted reviews only: a pending review is a private draft, so providers leave it out. */
  listReviews(query: { pullRequestId: string }): Promise<readonly Review[]>;
  /** Null when the pull request's head commit has no checks. */
  getCheckRollup(query: { pullRequestId: string }): Promise<CheckRollup | null>;
}
