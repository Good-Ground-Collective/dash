import { z } from 'zod';
import { acme, ada, GithubFeedItems, night } from './github-feed-items.ts';

const feedScenarioSchema = z.enum([
  'not-connected',
  'first-sync',
  'empty',
  'populated',
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
    return { status: 200, body: { connections, ...GithubFeedItems.all() } };
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
