import { z } from 'zod';
import {
  HttpMissionControl,
  missionControlBaseUrlSchema,
  type OnboardingReads,
  type SetupChecklistReport,
} from '#lib/api/mission-control.ts';
import {
  type AuthPageLoadEvent,
  shellDataSchema,
} from '#lib/server/auth-page-loader.ts';
import type { GithubFeedState } from '#lib/github-feed/feed-view.ts';
import {
  type GithubFeedLoader,
  MissionControlGithubFeedLoader,
} from '#lib/server/github-feed-loader.ts';

export const homeLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type HomeLoaderProps = z.input<typeof homeLoaderPropsSchema>;

export interface HomePageData {
  /** `null` when signed out or when Mission Control couldn't say, and home then leaves the card out. */
  checklist: SetupChecklistReport | null;
  /** `null` when signed out. */
  github: GithubFeedState | null;
}

/** Home's data for a signed-in person: the setup checklist and the GitHub feed, read side by side. */
export interface HomeLoader {
  readonly load: (event: AuthPageLoadEvent) => Promise<HomePageData>;
}

export class MissionControlHomeLoader implements HomeLoader {
  private readonly apiBaseUrl: string;
  private readonly github: GithubFeedLoader;

  constructor(props: HomeLoaderProps) {
    this.apiBaseUrl = homeLoaderPropsSchema.parse(props).apiBaseUrl;
    this.github = new MissionControlGithubFeedLoader({
      apiBaseUrl: this.apiBaseUrl,
    });
  }

  readonly load = async (event: AuthPageLoadEvent): Promise<HomePageData> => {
    const shell = shellDataSchema.parse(await event.parent());
    if (shell.viewer === null) return { checklist: null, github: null };

    const [checklist, github] = await Promise.all([
      this.checklist(event),
      this.github.read(event),
    ]);
    return { checklist, github };
  };

  private async checklist(
    event: AuthPageLoadEvent,
  ): Promise<SetupChecklistReport | null> {
    try {
      return await this.reads(event).getSetupChecklist();
    } catch (error) {
      console.warn(
        `Mission Control did not report the setup checklist: ${String(error)}`,
      );
      return null;
    }
  }

  private reads(event: AuthPageLoadEvent): OnboardingReads {
    return new HttpMissionControl({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
  }
}
