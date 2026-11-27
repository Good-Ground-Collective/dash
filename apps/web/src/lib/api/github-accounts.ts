import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import {
  type GithubAccounts,
  githubAccountsSchema,
  returnToSchema,
} from '#lib/api/github-account-contracts.ts';

export const httpGithubAccountsPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(20_000)
    .describe(
      'Mission Control calls GitHub for each installation, so this allows more than a plain read.',
    ),
});

export type HttpGithubAccountsProps = z.input<
  typeof httpGithubAccountsPropsSchema
>;

/** The GitHub accounts the signed-in person can connect. */
export interface GithubAccountReads {
  /** `returnTo` is the web path GitHub's redirects come back to. Rejects with a `MissionControlError`, code `SIGN_IN_REQUIRED` when signed out. */
  list(props: { returnTo: string }): Promise<GithubAccounts>;
}

/** Calls Mission Control's `GET /integrations/github/accounts` with credentials. */
export class HttpGithubAccounts implements GithubAccountReads {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpGithubAccountsProps) {
    const valid = httpGithubAccountsPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.timeoutMs = valid.timeoutMs;
  }

  async list(props: { returnTo: string }): Promise<GithubAccounts> {
    const path = 'integrations/github/accounts';
    const url = this.endpoint.url(path);
    url.searchParams.set('returnTo', returnToSchema.parse(props.returnTo));
    const response = await this.fetcher(url, {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.endpoint.read({ path, response, schema: githubAccountsSchema });
  }

  /** For the page: global `fetch`, which sends the Mission Control session cookie. */
  static inBrowser(props: { baseUrl: string }): HttpGithubAccounts {
    return new HttpGithubAccounts({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
