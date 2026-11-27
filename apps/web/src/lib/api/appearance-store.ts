import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

export const httpAppearanceStorePropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
});

export type HttpAppearanceStoreProps = z.input<
  typeof httpAppearanceStorePropsSchema
>;

/** Saves the signed-in person's theme and mode, so every device renders them. */
export interface AppearanceStore {
  save(preference: ThemePreference): Promise<void>;
}

/** Calls Mission Control's `/api/auth/appearance/update` with credentials. Failures are `MissionControlError`s. */
export class HttpAppearanceStore implements AppearanceStore {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;

  constructor(props: HttpAppearanceStoreProps) {
    const valid = httpAppearanceStorePropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
  }

  async save(preference: ThemePreference): Promise<void> {
    const response = await this.fetcher(
      this.endpoint.url(HttpAppearanceStore.PATH),
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(preference),
      },
    );

    await this.endpoint.read({
      path: HttpAppearanceStore.PATH,
      response,
      schema: z.unknown(),
    });
  }

  static readonly PATH = 'api/auth/appearance/update';

  /** For the page: global `fetch`, which sends the Mission Control session cookie. */
  static inBrowser(props: { baseUrl: string }): HttpAppearanceStore {
    return new HttpAppearanceStore({
      baseUrl: props.baseUrl,
      fetch: (input, init) => fetch(input, init),
    });
  }
}
