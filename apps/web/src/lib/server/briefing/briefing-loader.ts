import type { ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { HttpBriefings } from '#lib/api/briefings/briefings.ts';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import type { BriefingState } from '#lib/briefing/briefing-view.ts';

export const briefingLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type BriefingLoaderProps = z.input<typeof briefingLoaderPropsSchema>;

export type BriefingLoadEvent = Pick<ServerLoadEvent, 'fetch'>;

/** Reads the briefing for Home and Settings as Mission Control stored it. A failed read never fails the page. */
export interface BriefingLoader {
  readonly read: (event: BriefingLoadEvent) => Promise<BriefingState>;
}

export class MissionControlBriefingLoader implements BriefingLoader {
  private readonly apiBaseUrl: string;

  constructor(props: BriefingLoaderProps) {
    this.apiBaseUrl = briefingLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly read = async (event: BriefingLoadEvent): Promise<BriefingState> => {
    try {
      const briefings = await new HttpBriefings({
        baseUrl: this.apiBaseUrl,
        fetch: event.fetch,
      }).latest();
      return { status: 'loaded', briefings };
    } catch (error) {
      console.warn(`Mission Control did not send briefings: ${String(error)}`);
      return { status: 'failed' };
    }
  };
}
