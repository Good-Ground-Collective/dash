import { redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { SettingsSections } from '#lib/settings/settings-sections.ts';
import type { BriefingState } from '#lib/briefing/briefing-view.ts';
import {
  missionControlBaseUrlSchema,
  type Passkey,
  type Viewer,
} from '#lib/api/mission-control.ts';
import type { GithubFeedState } from '#lib/github-feed/feed-view.ts';
import {
  type AuthPageLoader,
  type AuthPageLoadEvent,
  MissionControlAuthPageLoader,
  shellDataSchema,
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

/**
 * What each Settings section reads, so a section fetches only what it shows. Every load sends a
 * signed-out visitor to sign in before it reads anything.
 */
export interface SettingsLoader {
  /** The signed-in viewer every section shows under. */
  readonly viewer: (event: AuthPageLoadEvent) => Promise<{ viewer: Viewer }>;
  /** `/settings` itself: sends a signed-in viewer to the first section, so old links land somewhere sensible. */
  readonly index: (event: AuthPageLoadEvent) => Promise<never>;
  /** `passkeys` is `null` when Mission Control couldn't list them. */
  readonly passkeys: (
    event: AuthPageLoadEvent,
  ) => Promise<{ passkeys: Passkey[] | null }>;
  /** `github` is the feed's state, `{ status: 'failed' }` when it couldn't be read; `null` only for a signed-out viewer, who is sent to sign in first. */
  readonly github: (
    event: AuthPageLoadEvent,
  ) => Promise<{ github: GithubFeedState | null }>;
  /** What Mission Control stored for the briefing, whose budget Settings reads out. */
  readonly briefing: (
    event: AuthPageLoadEvent,
  ) => Promise<{ briefing: BriefingState }>;
}

export class MissionControlSettingsLoader implements SettingsLoader {
  private readonly auth: AuthPageLoader;
  private readonly feeds: GithubFeedLoader;
  private readonly briefings: BriefingLoader;

  constructor(props: SettingsLoaderProps) {
    const { apiBaseUrl } = settingsLoaderPropsSchema.parse(props);
    this.auth = new MissionControlAuthPageLoader({ apiBaseUrl });
    this.feeds = new MissionControlGithubFeedLoader({ apiBaseUrl });
    this.briefings = new MissionControlBriefingLoader({ apiBaseUrl });
  }

  readonly viewer = async (
    event: AuthPageLoadEvent,
  ): Promise<{ viewer: Viewer }> => {
    const { viewer } = shellDataSchema.parse(await event.parent());
    if (viewer === null) redirect(303, '/sign-in');
    return { viewer };
  };

  readonly index = async (event: AuthPageLoadEvent): Promise<never> => {
    await this.viewer(event);
    redirect(307, SettingsSections.first().href);
  };

  readonly passkeys = async (
    event: AuthPageLoadEvent,
  ): Promise<{ passkeys: Passkey[] | null }> => {
    const { passkeys } = await this.auth.settings(event);
    return { passkeys };
  };

  readonly github = async (
    event: AuthPageLoadEvent,
  ): Promise<{ github: GithubFeedState | null }> => {
    await this.viewer(event);
    return { github: await this.feeds.read(event) };
  };

  readonly briefing = async (
    event: AuthPageLoadEvent,
  ): Promise<{ briefing: BriefingState }> => {
    await this.viewer(event);
    return { briefing: await this.briefings.read(event) };
  };
}
