import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import {
  type WatchedChecks,
  type WatchMode,
  watchedChecksSchema,
} from '#lib/api/watched-checks/watched-checks-contracts.ts';

export const httpWatchedChecksPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(5000)
    .describe(
      'Choices are stored by Mission Control, so they never wait on GitHub.',
    ),
});

export type HttpWatchedChecksProps = z.input<
  typeof httpWatchedChecksPropsSchema
>;

/**
 * Which checks the signed-in person watches. Every call answers with their whole choice
 * afterwards. Failures are `MissionControlError`s, code `SIGN_IN_REQUIRED` when signed out.
 */
export interface WatchedChecksClient {
  read(): Promise<WatchedChecks>;
  addRule(props: { pattern: string }): Promise<WatchedChecks>;
  /** Rejects with code `WATCH_RULE_NOT_FOUND` (404) when the person has no such rule. */
  removeRule(props: { id: string }): Promise<WatchedChecks>;
  setOverride(props: {
    repository: string;
    checkName: string;
    mode: WatchMode;
  }): Promise<WatchedChecks>;
  clearOverride(props: {
    repository: string;
    checkName: string;
  }): Promise<WatchedChecks>;
}

const basePath = 'integrations/github/watched-checks';

interface Send {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: object | undefined;
  query?: URLSearchParams | undefined;
}

/** Calls Mission Control's `/integrations/github/watched-checks` routes with credentials, from the web server. */
export class HttpWatchedChecks implements WatchedChecksClient {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpWatchedChecksProps) {
    const valid = httpWatchedChecksPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.timeoutMs = valid.timeoutMs;
  }

  async read(): Promise<WatchedChecks> {
    return this.send({ method: 'GET', path: basePath });
  }

  async addRule(props: { pattern: string }): Promise<WatchedChecks> {
    return this.send({
      method: 'POST',
      path: `${basePath}/rules`,
      body: { pattern: props.pattern },
    });
  }

  async removeRule(props: { id: string }): Promise<WatchedChecks> {
    return this.send({
      method: 'DELETE',
      path: `${basePath}/rules/${encodeURIComponent(props.id)}`,
    });
  }

  async setOverride(props: {
    repository: string;
    checkName: string;
    mode: WatchMode;
  }): Promise<WatchedChecks> {
    return this.send({
      method: 'PUT',
      path: `${basePath}/overrides`,
      body: props,
    });
  }

  async clearOverride(props: {
    repository: string;
    checkName: string;
  }): Promise<WatchedChecks> {
    return this.send({
      method: 'DELETE',
      path: `${basePath}/overrides`,
      query: new URLSearchParams({
        repository: props.repository,
        checkName: props.checkName,
      }),
    });
  }

  private async send(props: Send): Promise<WatchedChecks> {
    const url = this.endpoint.url(props.path);
    if (props.query !== undefined) {
      url.search = props.query.toString();
    }
    const headers = new Headers({ accept: 'application/json' });
    if (props.body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    const response = await this.fetcher(url, {
      method: props.method,
      credentials: 'include',
      headers,
      body: props.body === undefined ? null : JSON.stringify(props.body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.endpoint.read({
      path: props.path,
      response,
      schema: watchedChecksSchema,
    });
  }
}
