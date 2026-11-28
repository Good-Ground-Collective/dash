import type {
  Activity,
  ActivityFeed,
  ActivityPullRequest,
  ActivityQuery,
  ActivityRelease,
} from '@dash/integrations-core';

import type { GithubFeed } from '#src/github-feed/contracts/github-feed.ts';
import type { GithubSyncTarget } from '#src/github-feed/contracts/github-source.ts';

export const adaId = '00000000-0000-4000-8000-00000000000a';
export const graceId = '00000000-0000-4000-8000-00000000000b';
export const ownedId = '10000000-0000-4000-8000-000000000001';
export const guestId = '10000000-0000-4000-8000-000000000002';
export const fixedNow = new Date('2026-11-26T12:00:00Z');

/** A provider activity feed that answers with a set activity, or fails, and records each query. A read waits for `held` when it is set. */
export class FakeActivityFeed implements ActivityFeed {
  readonly queries: ActivityQuery[] = [];
  activity: Activity = GithubFeedFixtures.activity();
  failure: Error | null = null;
  held: Promise<void> | null = null;

  async read(query: ActivityQuery): Promise<Activity> {
    this.queries.push(query);
    const { activity, failure, held } = this;
    await held;
    if (failure !== null) {
      throw failure;
    }
    return activity;
  }
}

/** Ada's GitHub work in the acme organisation, as a provider reports it. */
export class GithubFeedFixtures {
  static target(overrides: Partial<GithubSyncTarget> = {}): GithubSyncTarget {
    return {
      connectionId: ownedId,
      kind: 'owned',
      installationId: '42',
      account: { login: 'acme', kind: 'organization' },
      connectedBy: adaId,
      suspended: false,
      repositories: ['acme/app'],
      ...overrides,
    };
  }

  static pullRequest(
    overrides: Partial<ActivityPullRequest> = {},
  ): ActivityPullRequest {
    const number = overrides.number ?? 1;
    return {
      provider: 'github',
      externalId: `PR_${number}`,
      url: `https://github.com/acme/app/pull/${number}`,
      repositoryId: 'R_app',
      number,
      title: `Change ${number}`,
      author: 'grace',
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      reviewDecision: 'review_required',
      headRef: `feature-${number}`,
      headSha: `sha${number}`,
      requestedReviewers: [
        { kind: 'user', name: 'ada' },
        { kind: 'team', name: 'platform' },
      ],
      checks: { state: 'failure', success: 3, failure: 1, pending: 0 },
      mergedAt: null,
      updatedAt: '2026-11-26T10:00:00Z',
      ...overrides,
    };
  }

  /** Ada's own pull request, merged at `mergedAt`. */
  static mergedPullRequest(props: {
    number: number;
    mergedAt: string;
  }): ActivityPullRequest {
    return GithubFeedFixtures.pullRequest({
      number: props.number,
      author: 'ada',
      state: 'merged',
      requestedReviewers: [],
      checks: null,
      mergedAt: props.mergedAt,
      updatedAt: props.mergedAt,
    });
  }

  static release(props: {
    id: string;
    publishedAt: string;
    repositoryId?: string;
  }): ActivityRelease {
    return {
      provider: 'github',
      externalId: `REL_${props.id}`,
      url: `https://github.com/acme/app/releases/tag/${props.id}`,
      repositoryId: props.repositoryId ?? 'R_app',
      tagName: props.id,
      name: `Release ${props.id}`,
      author: 'grace',
      prerelease: false,
      publishedAt: props.publishedAt,
    };
  }

  static activity(): Activity {
    return {
      repositories: [
        {
          provider: 'github',
          externalId: 'R_app',
          url: 'https://github.com/acme/app',
          fullName: 'acme/app',
          defaultBranch: 'main',
          archived: false,
        },
      ],
      reviewRequests: [GithubFeedFixtures.pullRequest({ number: 1 })],
      authoredPullRequests: [
        GithubFeedFixtures.pullRequest({
          number: 2,
          author: 'Ada',
          requestedReviewers: [],
          checks: null,
          updatedAt: '2026-11-26T11:00:00Z',
        }),
      ],
      mergedPullRequests: [],
      releases: [],
      releaseReads: [],
      failedRuns: [
        {
          provider: 'github',
          externalId: 'WFR_9',
          url: 'https://github.com/acme/app/actions/runs/9',
          repositoryId: 'R_app',
          pullRequestId: null,
          workflowName: 'ci',
          runNumber: 9,
          branch: 'main',
          headSha: 'main-head',
          event: 'push',
          conclusion: 'failure',
          updatedAt: '2026-11-26T09:00:00Z',
        },
      ],
      assignedIssues: [
        {
          provider: 'github',
          externalId: 'I_5',
          url: 'https://github.com/acme/app/issues/5',
          repositoryId: 'R_app',
          number: 5,
          title: 'Broken build badge',
          author: null,
          assignees: ['ada', 'grace'],
          updatedAt: '2026-11-25T12:00:00Z',
        },
      ],
      truncated: false,
    };
  }

  /** The feed's items with their connection blanked, to compare what each kind of connection produced. */
  static comparable(feed: GithubFeed | undefined) {
    const item = <T extends { connectionId: string }>(value: T) => ({
      ...value,
      connectionId: 'any',
    });
    return {
      reviewRequests: feed?.reviewRequests.map(item),
      myPullRequests: feed?.myPullRequests.map(item),
      recentMerges: feed?.recentMerges.map(item),
      releases: feed?.releases.map(item),
      failedRuns: feed?.failedRuns.map(item),
      assignedIssues: feed?.assignedIssues.map(item),
    };
  }
}
