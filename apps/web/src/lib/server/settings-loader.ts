import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import type { GithubFeedState } from '#lib/github-feed/feed-view.ts';
import {
  type AuthPageLoader,
  type AuthPageLoadEvent,
  MissionControlAuthPageLoader,
  type SettingsPageData,
} from '#lib/server/auth-page-loader.ts';
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
}

/** `/settings`: passkeys and the viewer, plus the GitHub connections Settings › Connections lists. */
export interface SettingsLoader {
  readonly load: (
    event: AuthPageLoadEvent,
  ) => Promise<SettingsWithConnectionsData>;
}

export class MissionControlSettingsLoader implements SettingsLoader {
  private readonly auth: AuthPageLoader;
  private readonly github: GithubFeedLoader;

  constructor(props: SettingsLoaderProps) {
    const { apiBaseUrl } = settingsLoaderPropsSchema.parse(props);
    this.auth = new MissionControlAuthPageLoader({ apiBaseUrl });
    this.github = new MissionControlGithubFeedLoader({ apiBaseUrl });
  }

  readonly load = async (
    event: AuthPageLoadEvent,
  ): Promise<SettingsWithConnectionsData> => {
    const [settings, github] = await Promise.all([
      this.auth.settings(event),
      this.github.read(event),
    ]);
    return { ...settings, github };
  };
}
