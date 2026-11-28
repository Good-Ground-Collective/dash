import { z } from 'zod';
import {
  type Briefings,
  briefingsSchema,
  type RegenerateAccepted,
  regenerateAcceptedSchema,
} from '#lib/api/briefings/briefing-contracts.ts';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';

export const httpBriefingsPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(5000)
    .describe(
      'Briefings are read from what Mission Control stored, so they never wait on the model.',
    ),
});

export type HttpBriefingsProps = z.input<typeof httpBriefingsPropsSchema>;

/** The signed-in person's briefings and the one action on them. Failures are `MissionControlError`s. */
export interface BriefingsClient {
  latest(): Promise<Briefings>;
  /** Rejects with code `BRIEFING_NOT_CONFIGURED` (409) when no writer is set up. */
  regenerate(): Promise<RegenerateAccepted>;
}

/** Calls Mission Control's `GET /briefings` and `POST /briefing/regenerate` with credentials. */
export class HttpBriefings implements BriefingsClient {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpBriefingsProps) {
    const valid = httpBriefingsPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.timeoutMs = valid.timeoutMs;
  }

  async latest(): Promise<Briefings> {
    const path = 'briefings';
    const response = await this.fetcher(this.endpoint.url(path), {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.endpoint.read({ path, response, schema: briefingsSchema });
  }

  async regenerate(): Promise<RegenerateAccepted> {
    const path = 'briefing/regenerate';
    const response = await this.fetcher(this.endpoint.url(path), {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.endpoint.read({
      path,
      response,
      schema: regenerateAcceptedSchema,
    });
  }

  /** For the page: global `fetch`, which sends the Mission Control session cookie. */
  static inBrowser(props: { baseUrl: string }): HttpBriefings {
    return new HttpBriefings({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
