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

export const homeLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type HomeLoaderProps = z.input<typeof homeLoaderPropsSchema>;

export interface HomePageData {
  /** `null` when signed out or when Mission Control couldn't say, and home then leaves the card out. */
  checklist: SetupChecklistReport | null;
}

/** Home's data: the setup checklist for a signed-in person, read in one call. */
export interface HomeLoader {
  readonly load: (event: AuthPageLoadEvent) => Promise<HomePageData>;
}

export class MissionControlHomeLoader implements HomeLoader {
  private readonly apiBaseUrl: string;

  constructor(props: HomeLoaderProps) {
    this.apiBaseUrl = homeLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly load = async (event: AuthPageLoadEvent): Promise<HomePageData> => {
    const shell = shellDataSchema.parse(await event.parent());
    if (shell.viewer === null) return { checklist: null };

    try {
      return { checklist: await this.reads(event).getSetupChecklist() };
    } catch (error) {
      console.warn(
        `Mission Control did not report the setup checklist: ${String(error)}`,
      );
      return { checklist: null };
    }
  };

  private reads(event: AuthPageLoadEvent): OnboardingReads {
    return new HttpMissionControl({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
  }
}
