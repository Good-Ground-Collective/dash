import type { ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import {
  HttpMissionControl,
  missionControlBaseUrlSchema,
  type Viewer,
} from '#lib/api/mission-control.ts';
import { type BuildStamp, buildStampSchema } from '#lib/build/build-stamp.ts';

export const shellLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
  build: buildStampSchema,
});

export type ShellLoaderProps = z.input<typeof shellLoaderPropsSchema>;

export interface ShellData {
  viewer: Viewer | null;
  build: BuildStamp;
}

/** Runs for every route through the root layout, so it must stay cheap for anonymous visitors. */
export interface ShellLoader {
  readonly load: (event: ShellLoadEvent) => Promise<ShellData>;
}

export type ShellLoadEvent = Pick<ServerLoadEvent, 'fetch' | 'locals'>;

/** Asks Mission Control for the viewer and adds the build stamp. The shell still renders when Mission Control is unreachable. */
export class MissionControlShellLoader implements ShellLoader {
  private readonly apiBaseUrl: string;
  private readonly build: BuildStamp;

  constructor(props: ShellLoaderProps) {
    const valid = shellLoaderPropsSchema.parse(props);
    this.apiBaseUrl = valid.apiBaseUrl;
    this.build = valid.build;
  }

  readonly load = async (event: ShellLoadEvent): Promise<ShellData> => {
    const { build } = this;
    if (!event.locals.hasSessionCookie) return { viewer: null, build };

    const missionControl = new HttpMissionControl({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
    try {
      return { viewer: await missionControl.getViewer(), build };
    } catch (error) {
      console.warn(
        `Mission Control did not return the viewer: ${String(error)}`,
      );
      return { viewer: null, build };
    }
  };
}
