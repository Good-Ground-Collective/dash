import type { ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import {
  HttpMissionControl,
  missionControlBaseUrlSchema,
  type Viewer,
} from '#lib/api/mission-control.ts';

export const shellLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type ShellLoaderProps = z.input<typeof shellLoaderPropsSchema>;

export interface ShellData {
  viewer: Viewer | null;
}

/** Loads what the app shell needs. */
export interface ShellLoader {
  readonly load: (event: ShellLoadEvent) => Promise<ShellData>;
}

export type ShellLoadEvent = Pick<ServerLoadEvent, 'fetch' | 'locals'>;

/** Asks Mission Control for the viewer. The shell still renders when Mission Control is unreachable. */
export class MissionControlShellLoader implements ShellLoader {
  private readonly apiBaseUrl: string;

  constructor(props: ShellLoaderProps) {
    this.apiBaseUrl = shellLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly load = async (event: ShellLoadEvent): Promise<ShellData> => {
    if (!event.locals.hasSessionCookie) return { viewer: null };

    const missionControl = new HttpMissionControl({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
    try {
      return { viewer: await missionControl.getViewer() };
    } catch (error) {
      console.warn(
        `Mission Control did not return the viewer: ${String(error)}`,
      );
      return { viewer: null };
    }
  };
}
