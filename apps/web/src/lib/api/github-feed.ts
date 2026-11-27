import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import {
  type GithubFeed,
  githubFeedSchema,
} from '#lib/api/github-feed-contracts.ts';

export const httpGithubFeedPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(5000)
    .describe(
      'The feed is read from what Mission Control stored, so it never waits on GitHub.',
    ),
});

export type HttpGithubFeedProps = z.input<typeof httpGithubFeedPropsSchema>;

/** The signed-in person's GitHub work, as Mission Control last read it. */
export interface GithubFeedReads {
  /** Rejects with a `MissionControlError`, code `SIGN_IN_REQUIRED` when signed out. */
  get(): Promise<GithubFeed>;
}

/** Calls Mission Control's `GET /integrations/github/feed` with credentials. */
export class HttpGithubFeed implements GithubFeedReads {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpGithubFeedProps) {
    const valid = httpGithubFeedPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.timeoutMs = valid.timeoutMs;
  }

  async get(): Promise<GithubFeed> {
    const path = 'integrations/github/feed';
    const response = await this.fetcher(this.endpoint.url(path), {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.endpoint.read({ path, response, schema: githubFeedSchema });
  }
}
