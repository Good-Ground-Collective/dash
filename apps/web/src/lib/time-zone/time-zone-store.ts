import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';

export const httpTimeZoneStorePropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
});

export type HttpTimeZoneStoreProps = z.input<
  typeof httpTimeZoneStorePropsSchema
>;

/** Saves the signed-in person's time zone, which Mission Control schedules their work by. */
export interface TimeZoneStore {
  save(timeZone: string): Promise<void>;
}

/** Calls Mission Control's `/api/people/me/time-zone` with credentials. Failures are `MissionControlError`s. */
export class HttpTimeZoneStore implements TimeZoneStore {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;

  constructor(props: HttpTimeZoneStoreProps) {
    const valid = httpTimeZoneStorePropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
  }

  async save(timeZone: string): Promise<void> {
    const response = await this.fetcher(
      this.endpoint.url(HttpTimeZoneStore.PATH),
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ timeZone }),
      },
    );

    await this.endpoint.read({
      path: HttpTimeZoneStore.PATH,
      response,
      schema: z.unknown(),
    });
  }

  static readonly PATH = 'api/people/me/time-zone';

  /** For the page: global `fetch`, which sends the Mission Control session cookie. */
  static inBrowser(props: { baseUrl: string }): HttpTimeZoneStore {
    return new HttpTimeZoneStore({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
