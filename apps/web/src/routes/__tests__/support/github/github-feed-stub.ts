import { z } from 'zod';

const feedScenarioSchema = z.enum([
  'not-connected',
  'first-sync',
  'empty',
  'populated',
  'failing',
]);

type FeedScenario = z.infer<typeof feedScenarioSchema>;

interface StubJson {
  status: number;
  body: object;
}

const acme = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0001';
const night = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0002';

/**
 * Mission Control's `GET /integrations/github/feed` for `GithubStub`. Times are worked out
 * from the moment of the request, so “5 minutes ago” reads the same on every run.
 * `POST /integrations/github/__stub/feed?name=…` picks the scenario.
 */
export class GithubFeedStub {
  private scenario: FeedScenario = 'not-connected';

  reset(): void {
    this.scenario = 'not-connected';
  }

  choose(name: string | null): void {
    this.scenario = feedScenarioSchema.parse(name);
  }

  feed(props: { signedIn: boolean }): StubJson {
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    if (this.scenario === 'failing') {
      return { status: 503, body: { code: 'UNAVAILABLE' } };
    }
    const empty = {
      reviewRequests: [],
      myPullRequests: [],
      failedRuns: [],
      assignedIssues: [],
    };
    if (this.scenario === 'not-connected') {
      return { status: 200, body: { connections: [], ...empty } };
    }
    if (this.scenario === 'first-sync') {
      return {
        status: 200,
        body: {
          connections: [GithubFeedStub.connection(acme, 'acme-labs', null)],
          ...empty,
        },
      };
    }
    const connections = [
      GithubFeedStub.connection(acme, 'acme-labs', 4),
      {
        ...GithubFeedStub.connection(night, 'night-shift', 190),
        lastError: 'GitHub rate-limited the read. Dash will try again soon.',
      },
    ];
    if (this.scenario === 'empty') {
      return { status: 200, body: { connections, ...empty } };
    }
    return { status: 200, body: { connections, ...GithubFeedStub.items() } };
  }

  private static connection(
    id: string,
    accountLogin: string,
    minutesAgo: number | null,
  ) {
    return {
      id,
      accountLogin,
      kind: 'owned',
      lastSyncedAt: minutesAgo === null ? null : GithubFeedStub.ago(minutesAgo),
      lastError: null,
    };
  }

  private static items() {
    return {
      reviewRequests: GithubFeedStub.reviewRequests(),
      myPullRequests: GithubFeedStub.myPullRequests(),
      ...GithubFeedStub.runsAndIssues(),
    };
  }

  private static reviewRequests() {
    const pull = GithubFeedStub.pull;
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
    const pull = GithubFeedStub.pull;
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

  private static runsAndIssues() {
    return {
      failedRuns: [
        GithubFeedStub.run({
          repo: 'acme-labs/web',
          workflow: 'CI',
          number: 1284,
          branch: 'show-sync-freshness',
          minutes: 70,
          conclusion: 'failure',
        }),
        GithubFeedStub.run({
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
        GithubFeedStub.issue({
          repo: 'acme-labs/web',
          number: 77,
          title: 'Dark mode flickers on first load',
          author: 'linus',
          minutes: 180,
        }),
        GithubFeedStub.issue({
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
      updatedAt: GithubFeedStub.ago(props.minutes),
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
    checks?: object;
    connection?: string;
  }) {
    return {
      ...GithubFeedStub.base({ ...props, path: `pull/${props.number}` }),
      number: props.number,
      title: props.title,
      author: props.author ?? 'ada',
      state: 'open',
      draft: props.draft ?? false,
      mergeable: props.mergeable ?? 'mergeable',
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
      ...GithubFeedStub.base({
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
      ...GithubFeedStub.base({ ...props, path: `issues/${props.number}` }),
      number: props.number,
      title: props.title,
      author: props.author,
      assignees: ['ada'],
    };
  }

  private static ago(minutes: number): string {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
  }
}
