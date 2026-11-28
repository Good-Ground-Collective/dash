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
import type { BriefingState } from '#lib/briefing/briefing-view.ts';
import type { ObjectivesState } from '#lib/objectives/objectives-view.ts';
import {
  type BriefingLoader,
  MissionControlBriefingLoader,
} from '#lib/server/briefing/briefing-loader.ts';
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
  /** `null` when signed out. */
  briefing: BriefingState | null;
}

/** Home's data for a signed-in person: the setup checklist, objectives, the GitHub feed and the briefing, read side by side. */
export interface HomeLoader {
  readonly load: (event: HomeLoadEvent) => Promise<HomePageData>;
}

export class MissionControlHomeLoader implements HomeLoader {
  private readonly apiBaseUrl: string;
  private readonly github: GithubFeedLoader;
  private readonly objectives: ObjectivesLoader;
  private readonly briefing: BriefingLoader;

  constructor(props: HomeLoaderProps) {
    this.apiBaseUrl = homeLoaderPropsSchema.parse(props).apiBaseUrl;
    this.github = new MissionControlGithubFeedLoader({
      apiBaseUrl: this.apiBaseUrl,
    });
    this.objectives = new MissionControlObjectivesLoader({
      apiBaseUrl: this.apiBaseUrl,
    });
    this.briefing = new MissionControlBriefingLoader({
      apiBaseUrl: this.apiBaseUrl,
    });
  }

  readonly load = async (event: HomeLoadEvent): Promise<HomePageData> => {
    const shell = shellDataSchema.parse(await event.parent());
    if (shell.viewer === null) {
      return {
        checklist: null,
        github: null,
        objectives: null,
        briefing: null,
      };
    }

    const [checklist, github, objectives, briefing] = await Promise.all([
      this.checklist(event),
      this.github.read(event),
      this.objectives.read(event),
      this.briefing.read(event),
    ]);
    return {
      checklist,
      github,
      objectives: MissionControlHomeLoader.withConnection({
        objectives,
        checklist,
        github,
      }),
      briefing,
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
