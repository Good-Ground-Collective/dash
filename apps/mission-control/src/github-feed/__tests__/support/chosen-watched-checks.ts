import { GithubFeedHarness } from '#src/github-feed/__tests__/support/github-feed-harness.ts';
import {
  type WatchedChecks,
  watchedChecksSchema,
} from '#src/github-feed/contracts/watched-checks.ts';

export const watchedChecksPath = '/integrations/github/watched-checks';

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Calls the watched-check routes of a harness as one person, or as nobody without a `userId`. */
export class ChosenWatchedChecks {
  static async request(props: {
    harness: GithubFeedHarness;
    method: Method;
    url: string;
    userId?: string;
    payload?: object | undefined;
  }) {
    const headers =
      props.userId === undefined ? {} : GithubFeedHarness.cookie(props.userId);
    const app = await props.harness.start();
    if (props.payload === undefined) {
      return app.inject({ method: props.method, url: props.url, headers });
    }
    return app.inject({
      method: props.method,
      url: props.url,
      headers,
      payload: props.payload,
    });
  }

  static parsed(
    response: Awaited<ReturnType<typeof ChosenWatchedChecks.request>>,
  ): WatchedChecks {
    return watchedChecksSchema.parse(response.json());
  }

  static async read(props: {
    harness: GithubFeedHarness;
    userId: string;
  }): Promise<WatchedChecks> {
    return ChosenWatchedChecks.parsed(
      await ChosenWatchedChecks.request({
        ...props,
        method: 'GET',
        url: watchedChecksPath,
      }),
    );
  }

  static async addRule(props: {
    harness: GithubFeedHarness;
    userId: string;
    pattern: string;
  }): Promise<WatchedChecks> {
    return ChosenWatchedChecks.parsed(
      await ChosenWatchedChecks.request({
        harness: props.harness,
        userId: props.userId,
        method: 'POST',
        url: `${watchedChecksPath}/rules`,
        payload: { pattern: props.pattern },
      }),
    );
  }

  static async setOverride(props: {
    harness: GithubFeedHarness;
    userId: string;
    payload: object;
  }) {
    return ChosenWatchedChecks.request({
      ...props,
      method: 'PUT',
      url: `${watchedChecksPath}/overrides`,
    });
  }

  static async clearOverride(props: {
    harness: GithubFeedHarness;
    userId: string;
    repository: string;
    checkName: string;
  }) {
    const query = new URLSearchParams({
      repository: props.repository,
      checkName: props.checkName,
    });
    return ChosenWatchedChecks.request({
      harness: props.harness,
      userId: props.userId,
      method: 'DELETE',
      url: `${watchedChecksPath}/overrides?${query.toString()}`,
    });
  }
}
