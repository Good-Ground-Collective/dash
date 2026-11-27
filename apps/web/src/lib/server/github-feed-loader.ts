import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { type GithubFeedReads, HttpGithubFeed } from '#lib/api/github-feed.ts';
import type { GithubFeedState } from '#lib/github-feed/feed-view.ts';
import {
  type AuthPageLoadEvent,
  shellDataSchema,
} from '#lib/server/auth-page-loader.ts';

export const githubFeedLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type GithubFeedLoaderProps = z.input<typeof githubFeedLoaderPropsSchema>;

export interface GithubPageData {
  github: GithubFeedState;
}

/** Reads the GitHub feed for the pages that show it. A failed read never fails the page. */
export interface GithubFeedLoader {
  /** `null` when signed out. */
  readonly read: (event: AuthPageLoadEvent) => Promise<GithubFeedState | null>;
  /** `/github`, for a signed-in person. */
  readonly page: (event: AuthPageLoadEvent) => Promise<GithubPageData>;
}

export class MissionControlGithubFeedLoader implements GithubFeedLoader {
  private readonly apiBaseUrl: string;

  constructor(props: GithubFeedLoaderProps) {
    this.apiBaseUrl = githubFeedLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly read = async (
    event: AuthPageLoadEvent,
  ): Promise<GithubFeedState | null> => {
    const shell = shellDataSchema.parse(await event.parent());
    if (shell.viewer === null) return null;
    return this.fetchFeed(event);
  };

  readonly page = async (event: AuthPageLoadEvent): Promise<GithubPageData> => {
    const github = await this.read(event);
    if (github === null) redirect(303, '/sign-in');
    return { github };
  };

  private async fetchFeed(event: AuthPageLoadEvent): Promise<GithubFeedState> {
    try {
      return { status: 'loaded', feed: await this.reads(event).get() };
    } catch (error) {
      console.warn(
        `Mission Control did not send the GitHub feed: ${String(error)}`,
      );
      return { status: 'failed' };
    }
  }

  private reads(event: AuthPageLoadEvent): GithubFeedReads {
    return new HttpGithubFeed({ baseUrl: this.apiBaseUrl, fetch: event.fetch });
  }
}
