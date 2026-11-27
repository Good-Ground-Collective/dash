import { type Cookies, redirect, type ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import {
  HttpMissionControl,
  missionControlBaseUrlSchema,
  type RecoveryCodeStatus,
  type Viewer,
} from '#lib/api/mission-control.ts';
import { type BuildStamp, buildStampSchema } from '#lib/build/build-stamp.ts';
import {
  type RecoveryCodeGate,
  recoveryCodeGate,
} from '#lib/server/recovery-code-gate.ts';
import {
  type ThemeCookieMirror,
  themeCookieMirror,
} from '#lib/theme/theme-cookie-mirror.ts';
import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

export const shellLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
  build: buildStampSchema,
});

export type ShellLoaderProps = z.input<typeof shellLoaderPropsSchema>;

export interface ShellData {
  viewer: Viewer | null;
  /** The viewer's recovery codes, or `null` when signed out or Mission Control couldn't say. */
  recoveryCodes: RecoveryCodeStatus | null;
  /** The theme and mode the page rendered in. */
  appearance: ThemePreference;
  build: BuildStamp;
}

/** Runs for every route through the root layout, so it must stay cheap for anonymous visitors. */
export interface ShellLoader {
  readonly load: (event: ShellLoadEvent) => Promise<ShellData>;
}

export type ShellLoadEvent = Pick<ServerLoadEvent, 'fetch' | 'locals'> & {
  cookies: Pick<Cookies, 'get' | 'set'>;
  url: Pick<URL, 'pathname'>;
};

/** Asks Mission Control for the viewer, sends them to the codes step until they've saved recovery codes, renders in their saved appearance and adds the build stamp. The shell still renders when Mission Control is unreachable. */
export class MissionControlShellLoader implements ShellLoader {
  private readonly apiBaseUrl: string;
  private readonly build: BuildStamp;
  private readonly cookieMirror: ThemeCookieMirror = themeCookieMirror;
  private readonly gate: RecoveryCodeGate = recoveryCodeGate;

  constructor(props: ShellLoaderProps) {
    const valid = shellLoaderPropsSchema.parse(props);
    this.apiBaseUrl = valid.apiBaseUrl;
    this.build = valid.build;
  }

  readonly load = async (event: ShellLoadEvent): Promise<ShellData> => {
    const viewer = await this.viewer(event);
    const recoveryCodes =
      viewer === null ? null : await this.recoveryCodes(event);
    const location = this.gate.redirectFor({
      pathname: event.url.pathname,
      status: recoveryCodes,
    });
    if (location !== null) redirect(303, location);
    event.locals.themePreference = this.cookieMirror.resolve({
      cookies: event.cookies,
      requested: event.locals.themePreference,
      saved: viewer,
    });
    return {
      viewer,
      recoveryCodes,
      appearance: event.locals.themePreference,
      build: this.build,
    };
  };

  private async viewer(event: ShellLoadEvent): Promise<Viewer | null> {
    if (!event.locals.hasSessionCookie) return null;

    try {
      return await this.missionControl(event).getViewer();
    } catch (error) {
      console.warn(
        `Mission Control did not return the viewer: ${String(error)}`,
      );
      return null;
    }
  }

  private async recoveryCodes(
    event: ShellLoadEvent,
  ): Promise<RecoveryCodeStatus | null> {
    try {
      return await this.missionControl(event).getRecoveryCodeStatus();
    } catch (error) {
      console.warn(
        `Mission Control did not report recovery codes: ${String(error)}`,
      );
      return null;
    }
  }

  private missionControl(event: ShellLoadEvent): HttpMissionControl {
    return new HttpMissionControl({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
  }
}
