import { z } from 'zod';
import type { BriefingState } from '#lib/briefing/briefing-view.ts';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import type { GithubFeedState } from '#lib/github-feed/feed-view.ts';
import {
  type AuthPageLoader,
  type AuthPageLoadEvent,
  MissionControlAuthPageLoader,
  type SettingsPageData,
} from '#lib/server/auth-page-loader.ts';
import {
  type BriefingLoader,
  MissionControlBriefingLoader,
} from '#lib/server/briefing/briefing-loader.ts';
import {
  type GithubFeedLoader,
  MissionControlGithubFeedLoader,
} from '#lib/server/github-feed-loader.ts';

export const settingsLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type SettingsLoaderProps = z.input<typeof settingsLoaderPropsSchema>;

export interface SettingsWithConnectionsData extends SettingsPageData {
  /** `null` when signed out. */
  github: GithubFeedState | null;
  /** What Mission Control stored for the briefing, whose budget Settings reads out. */
  briefing: BriefingState;
}

/** `/settings`: passkeys and the viewer, plus the GitHub connections and the briefing budget it lists. */
export interface SettingsLoader {
  readonly load: (
    event: AuthPageLoadEvent,
  ) => Promise<SettingsWithConnectionsData>;
}

export class MissionControlSettingsLoader implements SettingsLoader {
  private readonly auth: AuthPageLoader;
  private readonly github: GithubFeedLoader;
  private readonly briefing: BriefingLoader;

  constructor(props: SettingsLoaderProps) {
    const { apiBaseUrl } = settingsLoaderPropsSchema.parse(props);
    this.auth = new MissionControlAuthPageLoader({ apiBaseUrl });
    this.github = new MissionControlGithubFeedLoader({ apiBaseUrl });
    this.briefing = new MissionControlBriefingLoader({ apiBaseUrl });
  }

  readonly load = async (
    event: AuthPageLoadEvent,
  ): Promise<SettingsWithConnectionsData> => {
    const [settings, github, briefing] = await Promise.all([
      this.auth.settings(event),
      this.github.read(event),
      this.briefing.read(event),
    ]);
    return { ...settings, github, briefing };
  };
}
