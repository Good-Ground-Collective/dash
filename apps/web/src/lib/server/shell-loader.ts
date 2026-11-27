import type { Cookies, ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import {
  HttpMissionControl,
  missionControlBaseUrlSchema,
  type Viewer,
} from '#lib/api/mission-control.ts';
import {
  type ThemeCookieMirror,
  themeCookieMirror,
} from '#lib/theme/theme-cookie-mirror.ts';
import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

export const shellLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type ShellLoaderProps = z.input<typeof shellLoaderPropsSchema>;

export interface ShellData {
  viewer: Viewer | null;
  /** The theme and mode the page rendered in. */
  appearance: ThemePreference;
}

/** Runs for every route through the root layout, so it must stay cheap for anonymous visitors. */
export interface ShellLoader {
  readonly load: (event: ShellLoadEvent) => Promise<ShellData>;
}

export type ShellLoadEvent = Pick<ServerLoadEvent, 'fetch' | 'locals'> & {
  cookies: Pick<Cookies, 'get' | 'set'>;
};

/** Asks Mission Control for the viewer and renders in their saved appearance. The shell still renders when Mission Control is unreachable. */
export class MissionControlShellLoader implements ShellLoader {
  private readonly apiBaseUrl: string;
  private readonly cookieMirror: ThemeCookieMirror = themeCookieMirror;

  constructor(props: ShellLoaderProps) {
    this.apiBaseUrl = shellLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly load = async (event: ShellLoadEvent): Promise<ShellData> => {
    const viewer = await this.viewer(event);
    event.locals.themePreference = this.cookieMirror.resolve({
      cookies: event.cookies,
      requested: event.locals.themePreference,
      saved: viewer,
    });
    return { viewer, appearance: event.locals.themePreference };
  };

  private async viewer(event: ShellLoadEvent): Promise<Viewer | null> {
    if (!event.locals.hasSessionCookie) return null;

    const missionControl = new HttpMissionControl({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
    try {
      return await missionControl.getViewer();
    } catch (error) {
      console.warn(
        `Mission Control did not return the viewer: ${String(error)}`,
      );
      return null;
    }
  }
}
