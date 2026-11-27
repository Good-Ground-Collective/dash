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
import type { ObjectivesState } from '#lib/objectives/objectives-view.ts';
import {
  type GithubFeedLoader,
  MissionControlGithubFeedLoader,
} from '#lib/server/github-feed-loader.ts';
import {
  MissionControlObjectivesLoader,
  type ObjectivesLoadEvent,
  type ObjectivesLoader,
  type ObjectivesRead,
} from '#lib/server/objectives-loader.ts';

export const homeLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type HomeLoaderProps = z.input<typeof homeLoaderPropsSchema>;

export type HomeLoadEvent = AuthPageLoadEvent & ObjectivesLoadEvent;

export interface HomePageData {
  /** `null` when signed out or when Mission Control couldn't say, and home then leaves the card out. */
  checklist: SetupChecklistReport | null;
  /** `null` when signed out. */
  github: GithubFeedState | null;
  /** `null` when signed out. */
  objectives: ObjectivesState | null;
}

/** Home's data for a signed-in person: the setup checklist, objectives and the GitHub feed, read side by side. */
export interface HomeLoader {
  readonly load: (event: HomeLoadEvent) => Promise<HomePageData>;
}

export class MissionControlHomeLoader implements HomeLoader {
  private readonly apiBaseUrl: string;
  private readonly github: GithubFeedLoader;
  private readonly objectives: ObjectivesLoader;

  constructor(props: HomeLoaderProps) {
    this.apiBaseUrl = homeLoaderPropsSchema.parse(props).apiBaseUrl;
    this.github = new MissionControlGithubFeedLoader({
      apiBaseUrl: this.apiBaseUrl,
    });
    this.objectives = new MissionControlObjectivesLoader({
      apiBaseUrl: this.apiBaseUrl,
    });
  }

  readonly load = async (event: HomeLoadEvent): Promise<HomePageData> => {
    const shell = shellDataSchema.parse(await event.parent());
    if (shell.viewer === null) {
      return { checklist: null, github: null, objectives: null };
    }

    const [checklist, github, objectives] = await Promise.all([
      this.checklist(event),
      this.github.read(event),
      this.objectives.read(event),
    ]);
    return {
      checklist,
      github,
      objectives: MissionControlHomeLoader.withConnection({
        objectives,
        checklist,
        github,
      }),
    };
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

  /** `/objectives` lists a connection only once its first read starts, so the feed and checklist say whether GitHub is connected before then. */
  private static withConnection(props: {
    objectives: ObjectivesRead;
    checklist: SetupChecklistReport | null;
    github: GithubFeedState | null;
  }): ObjectivesState {
    if (props.objectives.status === 'failed') return props.objectives;
    const feedConnected =
      props.github?.status === 'loaded' &&
      props.github.feed.connections.length > 0;
    const checklistConnected =
      props.checklist?.items.some(
        ({ id, done }) => id === 'connectGitHub' && done,
      ) === true;
    return {
      ...props.objectives,
      githubConnected: feedConnected || checklistConnected,
    };
  }
}
