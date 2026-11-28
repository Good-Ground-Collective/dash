import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import {
  type NeedsYouItem,
  needsYouItemsSchema,
} from '#lib/needs-you/needs-you-contracts.ts';
import {
  type NeedsYouSession,
  needsYouSessionsSchema,
} from '#lib/needs-you/needs-you-session-contracts.ts';

export const httpNeedsYouPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z.number().int().positive().default(3000),
});

export type HttpNeedsYouProps = z.input<typeof httpNeedsYouPropsSchema>;

/** What is waiting on the signed-in person. */
export interface NeedsYouReads {
  /** Open items, newest first. Rejects with a `MissionControlError` when signed out. */
  listOpen(): Promise<NeedsYouItem[]>;
  /** The sessions agents reported in the last 24 hours, which say where an item's agent is running. */
  listSessions(): Promise<NeedsYouSession[]>;
}

/** Calls Mission Control's `GET /api/needs-you` with credentials. */
export class HttpNeedsYou implements NeedsYouReads {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpNeedsYouProps) {
    const valid = httpNeedsYouPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.timeoutMs = valid.timeoutMs;
  }

  async listOpen(): Promise<NeedsYouItem[]> {
    const list = await this.getJson({
      path: 'api/needs-you',
      schema: needsYouItemsSchema,
    });
    return list.items;
  }

  async listSessions(): Promise<NeedsYouSession[]> {
    const list = await this.getJson({
      path: 'api/agents/sessions',
      schema: needsYouSessionsSchema,
    });
    return list.sessions;
  }

  private async getJson<T>(props: {
    path: string;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const { path } = props;
    const response = await this.fetcher(this.endpoint.url(path), {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.endpoint.read({ path, response, schema: props.schema });
  }

  /** For the page: global `fetch`, which sends the Mission Control session cookie. */
  static inBrowser(props: { baseUrl: string }): HttpNeedsYou {
    return new HttpNeedsYou({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
