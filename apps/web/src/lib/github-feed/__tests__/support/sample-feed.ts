import type {
  GithubFeed,
  GithubFeedConnection,
  GithubFeedIssue,
  GithubFeedPullRequest,
  GithubFeedRelease,
  GithubFeedRun,
} from '#lib/api/github-feed-contracts.ts';

/** Feed items as Mission Control sends them, with only what a test cares about spelled out. */
export class SampleFeed {
  static connection(
    overrides: Partial<GithubFeedConnection> = {},
  ): GithubFeedConnection {
    return {
      id: 'c-acme',
      accountLogin: 'acme-labs',
      kind: 'owned',
      lastSyncedAt: new Date('2026-11-27T11:55:00Z'),
      lastError: null,
      truncated: false,
      ...overrides,
    };
  }

  static pull(
    overrides: Partial<GithubFeedPullRequest> = {},
  ): GithubFeedPullRequest {
    return {
      id: 'PR_1',
      connectionId: 'c-acme',
      repository: {
        fullName: 'acme-labs/api',
        url: 'https://github.com/acme-labs/api',
      },
      url: 'https://github.com/acme-labs/api/pull/42',
      updatedAt: new Date('2026-11-27T10:00:00Z'),
      mergedAt: null,
      createdAt: new Date('2026-11-20T08:00:00Z'),
      number: 42,
      title: 'Add rate limits',
      author: 'grace',
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      mergeState: 'clean',
      reviewDecision: null,
      headSha: 'abc123',
      requestedReviewers: [],
      checks: null,
      ...overrides,
    };
  }

  static release(
    overrides: Partial<GithubFeedRelease> = {},
  ): GithubFeedRelease {
    return {
      id: 'REL_1',
      connectionId: 'c-acme',
      repository: {
        fullName: 'acme-labs/api',
        url: 'https://github.com/acme-labs/api',
      },
      url: 'https://github.com/acme-labs/api/releases/tag/v1.2.0',
      tagName: 'v1.2.0',
      name: 'API 1.2.0',
      author: 'grace',
      prerelease: false,
      publishedAt: new Date('2026-11-27T09:00:00Z'),
      ...overrides,
    };
  }

  static run(overrides: Partial<GithubFeedRun> = {}): GithubFeedRun {
    return {
      id: 'RUN_1',
      connectionId: 'c-acme',
      repository: {
        fullName: 'acme-labs/api',
        url: 'https://github.com/acme-labs/api',
      },
      url: 'https://github.com/acme-labs/api/actions/runs/9',
      updatedAt: new Date('2026-11-27T09:00:00Z'),
      workflowName: 'CI',
      runNumber: 9,
      branch: 'main',
      headSha: 'def456',
      event: 'push',
      conclusion: 'failure',
      pullRequestId: null,
      ...overrides,
    };
  }

  static issue(overrides: Partial<GithubFeedIssue> = {}): GithubFeedIssue {
    return {
      id: 'I_1',
      connectionId: 'c-acme',
      repository: {
        fullName: 'acme-labs/web',
        url: 'https://github.com/acme-labs/web',
      },
      url: 'https://github.com/acme-labs/web/issues/7',
      updatedAt: new Date('2026-11-27T08:00:00Z'),
      number: 7,
      title: 'Dark mode flickers',
      author: 'linus',
      assignees: ['ada'],
      ...overrides,
    };
  }

  static feed(overrides: Partial<GithubFeed> = {}): GithubFeed {
    return {
      connections: [SampleFeed.connection()],
      reviewRequests: [],
      myPullRequests: [],
      recentMerges: [],
      releases: [],
      failedRuns: [],
      assignedIssues: [],
      ...overrides,
    };
  }
}
