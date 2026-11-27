import type {
  CheckRollup,
  PullRequest,
  Repository,
  Review,
  SourceControl,
} from '@dash/integrations-core';

/** A stub that reads nothing yet. */
export class GithubSourceControl implements SourceControl {
  async listRepositories(): Promise<readonly Repository[]> {
    return [];
  }

  async listPullRequests(): Promise<readonly PullRequest[]> {
    return [];
  }

  async listReviews(): Promise<readonly Review[]> {
    return [];
  }

  async getCheckRollup(): Promise<CheckRollup | null> {
    return null;
  }
}
