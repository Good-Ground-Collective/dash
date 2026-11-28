export const acme = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0001';
export const night = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0002';
export const ada = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0003';

/** The populated feed's items for `GithubFeedStub`, timed from the moment of the request. */
export class GithubFeedItems {
  static all() {
    return {
      reviewRequests: GithubFeedItems.reviewRequests(),
      myPullRequests: GithubFeedItems.myPullRequests(),
      recentMerges: GithubFeedItems.recentMerges(),
      releases: GithubFeedItems.releases(),
      ...GithubFeedItems.runsAndIssues(),
    };
  }

  static ago(minutes: number): string {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
  }

  private static reviewRequests() {
    const pull = GithubFeedItems.pull;
    return [
      pull({
        repo: 'acme-labs/api',
        number: 412,
        title: 'Rate-limit the public search endpoint',
        author: 'grace',
        minutes: 12,
      }),
      pull({
        repo: 'acme-labs/web',
        number: 88,
        title: 'Move settings to the new form layout',
        author: 'linus',
        minutes: 95,
        draft: true,
      }),
      pull({
        repo: 'night-shift/ops',
        number: 31,
        title: 'Rotate the staging deploy key',
        author: 'margaret',
        minutes: 240,
        connection: night,
      }),
      pull({
        repo: 'acme-labs/api',
        number: 405,
        title: 'Drop the legacy export job',
        author: 'grace',
        minutes: 1500,
      }),
    ];
  }

  private static myPullRequests() {
    const pull = GithubFeedItems.pull;
    return [
      pull({
        repo: 'acme-labs/api',
        number: 418,
        title: 'Retry webhooks with backoff',
        minutes: 30,
        review: 'approved',
        checks: { state: 'success', success: 6, failure: 0, pending: 0 },
      }),
      pull({
        repo: 'acme-labs/web',
        number: 90,
        title: 'Show sync freshness on the dashboard',
        minutes: 75,
        review: 'changes_requested',
        checks: { state: 'failure', success: 4, failure: 2, pending: 0 },
      }),
      pull({
        repo: 'night-shift/ops',
        number: 33,
        title: 'Pin the runner image',
        minutes: 300,
        review: 'review_required',
        mergeable: 'conflicting',
        checks: { state: 'pending', success: 2, failure: 0, pending: 3 },
        connection: night,
      }),
    ];
  }

  private static recentMerges() {
    const pull = GithubFeedItems.pull;
    return [
      pull({
        repo: 'acme-labs/api',
        number: 409,
        title: 'Cache the objectives read',
        minutes: 600,
        review: 'approved',
        state: 'merged',
        checks: { state: 'success', success: 6, failure: 0, pending: 0 },
      }),
      pull({
        repo: 'acme-labs/web',
        number: 71,
        title: 'Retire the old settings tabs',
        minutes: 60 * 40,
        state: 'merged',
      }),
    ];
  }

  private static releases() {
    return [
      GithubFeedItems.release({
        repo: 'acme-labs/api',
        tag: 'v2.4.0',
        name: 'API 2.4.0',
        minutes: 120,
      }),
      GithubFeedItems.release({
        repo: 'acme-labs/web',
        tag: 'v1.9.0',
        name: 'Web 1.9.0',
        minutes: 60 * 40,
      }),
    ];
  }

  private static runsAndIssues() {
    return {
      failedRuns: [
        GithubFeedItems.run({
          repo: 'acme-labs/web',
          workflow: 'CI',
          number: 1284,
          branch: 'show-sync-freshness',
          minutes: 70,
          conclusion: 'failure',
        }),
        GithubFeedItems.run({
          repo: 'night-shift/ops',
          workflow: 'Nightly backup check',
          number: 96,
          branch: 'main',
          minutes: 520,
          conclusion: 'timed_out',
          connection: night,
        }),
      ],
      assignedIssues: [
        GithubFeedItems.issue({
          repo: 'acme-labs/web',
          number: 77,
          title: 'Dark mode flickers on first load',
          author: 'linus',
          minutes: 180,
        }),
        GithubFeedItems.issue({
          repo: 'night-shift/ops',
          number: 12,
          title: 'Document the on-call handover',
          author: 'margaret',
          minutes: 4000,
          connection: night,
        }),
      ],
    };
  }

  private static base(props: {
    repo: string;
    path: string;
    minutes: number;
    connection?: string;
  }) {
    return {
      id: `${props.repo}/${props.path}`,
      connectionId: props.connection ?? acme,
      repository: {
        fullName: props.repo,
        url: `https://github.com/${props.repo}`,
      },
      url: `https://github.com/${props.repo}/${props.path}`,
      updatedAt: GithubFeedItems.ago(props.minutes),
    };
  }

  private static release(props: {
    repo: string;
    tag: string;
    name: string;
    minutes: number;
  }) {
    const { updatedAt, ...base } = GithubFeedItems.base({
      ...props,
      path: `releases/tag/${props.tag}`,
    });
    return {
      ...base,
      tagName: props.tag,
      name: props.name,
      author: 'grace',
      prerelease: false,
      publishedAt: updatedAt,
    };
  }

  private static pull(props: {
    repo: string;
    number: number;
    title: string;
    minutes: number;
    author?: string;
    draft?: boolean;
    review?: 'approved' | 'changes_requested' | 'review_required';
    mergeable?: 'mergeable' | 'conflicting';
    mergeState?: 'clean' | 'blocked' | 'behind' | 'dirty' | null;
    checks?: object;
    state?: 'open' | 'merged';
    connection?: string;
  }) {
    return {
      ...GithubFeedItems.base({ ...props, path: `pull/${props.number}` }),
      mergedAt:
        props.state === 'merged' ? GithubFeedItems.ago(props.minutes) : null,
      createdAt: GithubFeedItems.ago(props.minutes + 120),
      number: props.number,
      title: props.title,
      author: props.author ?? 'ada',
      state: props.state ?? 'open',
      draft: props.draft ?? false,
      mergeable: props.mergeable ?? 'mergeable',
      mergeState: props.mergeState ?? 'clean',
      reviewDecision: props.review ?? null,
      headSha: 'a1b2c3d',
      requestedReviewers: [{ kind: 'user', name: 'ada' }],
      checks: props.checks ?? null,
    };
  }

  private static run(props: {
    repo: string;
    workflow: string;
    number: number;
    branch: string;
    minutes: number;
    conclusion: 'failure' | 'timed_out';
    connection?: string;
  }) {
    return {
      ...GithubFeedItems.base({
        ...props,
        path: `actions/runs/${props.number}`,
      }),
      workflowName: props.workflow,
      runNumber: props.number,
      branch: props.branch,
      headSha: 'e4f5a6b',
      event: 'push',
      conclusion: props.conclusion,
      pullRequestId: null,
    };
  }

  private static issue(props: {
    repo: string;
    number: number;
    title: string;
    author: string;
    minutes: number;
    connection?: string;
  }) {
    return {
      ...GithubFeedItems.base({ ...props, path: `issues/${props.number}` }),
      number: props.number,
      title: props.title,
      author: props.author,
      assignees: ['ada'],
    };
  }
}
