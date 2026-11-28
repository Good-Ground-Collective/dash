import { z } from 'zod';
import { GithubFeedBranches } from './github-feed-branches.ts';
import { acme, ada, GithubFeedItems, night } from './github-feed-items.ts';
import type { GithubWatchedChecksStub } from './github-watched-checks-stub.ts';

const feedScenarioSchema = z.enum([
  'not-connected',
  'first-sync',
  'empty',
  'populated',
  'many-repos',
  'failing',
  'truncated',
]);

type FeedScenario = z.infer<typeof feedScenarioSchema>;

interface StubJson {
  status: number;
  body: object;
}

/**
 * Mission Control's `GET /integrations/github/feed` for `GithubStub`. Times are worked out
 * from the moment of the request, so “5 minutes ago” reads the same on every run. Default
 * branches carry the watched state the person's watched checks give them.
 * `POST /integrations/github/__stub/feed?name=…` picks the scenario.
 */
export class GithubFeedStub {
  private scenario: FeedScenario = 'not-connected';
  private readonly watched: GithubWatchedChecksStub;

  constructor(props: { watched: GithubWatchedChecksStub }) {
    this.watched = props.watched;
  }

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
      recentMerges: [],
      releases: [],
      failedRuns: [],
      defaultBranches: [],
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
      {
        ...GithubFeedStub.connection(acme, 'acme-labs', 4),
        truncated: this.scenario === 'truncated',
      },
      {
        ...GithubFeedStub.connection(night, 'night-shift', 190),
        lastError: 'GitHub rate-limited the read. Dash will try again soon.',
      },
      GithubFeedStub.connection(ada, 'ada', 4),
    ];
    if (this.scenario === 'empty') {
      return { status: 200, body: { connections, ...empty } };
    }
    const branches =
      this.scenario === 'many-repos'
        ? GithubFeedBranches.many(110)
        : GithubFeedBranches.all();
    return {
      status: 200,
      body: {
        connections,
        ...GithubFeedItems.all(),
        defaultBranches: this.watched.decorate(branches),
      },
    };
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
      lastSyncedAt:
        minutesAgo === null ? null : GithubFeedItems.ago(minutesAgo),
      lastError: null,
      truncated: minutesAgo === null ? null : false,
    };
  }
}
