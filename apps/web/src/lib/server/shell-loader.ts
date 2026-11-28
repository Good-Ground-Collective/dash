import { type Cookies, redirect, type ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import {
  HttpMissionControl,
  missionControlBaseUrlSchema,
  type RecoveryCodeStatus,
  type Viewer,
} from '#lib/api/mission-control.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';
import type { NeedsYouSession } from '#lib/needs-you/needs-you-session-contracts.ts';
import {
  type NeedsYouLoader,
  MissionControlNeedsYouLoader,
} from '#lib/server/needs-you/needs-you-loader.ts';
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
  /** What is waiting on the viewer, newest first. Empty when signed out or Mission Control couldn't say. */
  needsYou: NeedsYouItem[];
  /** The sessions those items came from, for saying where each agent runs. Empty when there are no items or Mission Control couldn't say. */
  needsYouSessions: NeedsYouSession[];
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

/** Asks Mission Control for the viewer and what is waiting on them, sends them to the codes step until they've saved recovery codes, renders in their saved appearance and adds the build stamp. The shell still renders when Mission Control is unreachable. */
export class MissionControlShellLoader implements ShellLoader {
  private readonly apiBaseUrl: string;
  private readonly build: BuildStamp;
  private readonly cookieMirror: ThemeCookieMirror = themeCookieMirror;
  private readonly gate: RecoveryCodeGate = recoveryCodeGate;
  private readonly needsYou: NeedsYouLoader;

  constructor(props: ShellLoaderProps) {
    const valid = shellLoaderPropsSchema.parse(props);
    this.apiBaseUrl = valid.apiBaseUrl;
    this.build = valid.build;
    this.needsYou = new MissionControlNeedsYouLoader({
      apiBaseUrl: valid.apiBaseUrl,
    });
  }

  readonly load = async (event: ShellLoadEvent): Promise<ShellData> => {
    const [viewer, codes, waiting] = await Promise.all([
      this.viewer(event),
      event.locals.hasSessionCookie ? this.recoveryCodes(event) : null,
      event.locals.hasSessionCookie
        ? this.needsYou.read(event)
        : { items: [], sessions: [] },
    ]);
    const recoveryCodes = viewer === null ? null : codes;

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
      needsYou: viewer === null ? [] : waiting.items,
      needsYouSessions: viewer === null ? [] : waiting.sessions,
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
      if (error instanceof MissionControlError && error.status === 401) {
        return null;
      }
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
