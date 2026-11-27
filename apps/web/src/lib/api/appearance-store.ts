import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

const failureSchema = z.object({ code: z.string().optional() });

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
  private readonly url: URL;
  private readonly fetcher: typeof fetch;

  constructor(props: HttpAppearanceStoreProps) {
    const valid = httpAppearanceStorePropsSchema.parse(props);
    const baseUrl = new URL(valid.baseUrl);
    if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
    this.url = new URL(HttpAppearanceStore.PATH, baseUrl);
    this.fetcher = valid.fetch;
  }

  async save(preference: ThemePreference): Promise<void> {
    const response = await this.fetcher(this.url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(preference),
    });
    if (!response.ok) {
      const failure = failureSchema.safeParse(
        await response.json().catch(() => null),
      );
      throw new MissionControlError({
        path: HttpAppearanceStore.PATH,
        status: response.status,
        code: failure.success ? failure.data.code : undefined,
      });
    }
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
