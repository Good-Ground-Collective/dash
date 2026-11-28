import { z } from 'zod';
import { HttpGithubFeed } from '#lib/api/github-feed.ts';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { HttpWatchedChecks } from '#lib/api/watched-checks/watched-checks.ts';
import type { AuthPageLoadEvent } from '#lib/server/auth-page-loader.ts';
import type { WatchedChecksState } from '#lib/watched-checks/watched-checks-view.ts';

export const watchedChecksLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type WatchedChecksLoaderProps = z.input<
  typeof watchedChecksLoaderPropsSchema
>;

/** Reads the feed and the person's choices for Settings → Watched checks. A failed read never fails the page. */
export interface WatchedChecksLoader {
  readonly read: (event: AuthPageLoadEvent) => Promise<WatchedChecksState>;
}

export class MissionControlWatchedChecksLoader implements WatchedChecksLoader {
  private readonly apiBaseUrl: string;

  constructor(props: WatchedChecksLoaderProps) {
    this.apiBaseUrl = watchedChecksLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly read = async (
    event: AuthPageLoadEvent,
  ): Promise<WatchedChecksState> => {
    try {
      const [feed, chosen] = await Promise.all([
        new HttpGithubFeed({
          baseUrl: this.apiBaseUrl,
          fetch: event.fetch,
        }).get(),
        new HttpWatchedChecks({
          baseUrl: this.apiBaseUrl,
          fetch: event.fetch,
        }).read(),
      ]);
      return { status: 'loaded', feed, chosen };
    } catch (error) {
      console.warn(
        `Mission Control did not send the watched checks: ${String(error)}`,
      );
      return { status: 'failed' };
    }
  };
}
