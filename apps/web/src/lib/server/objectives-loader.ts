import type { ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { HttpObjectives, type ObjectivesClient } from '#lib/api/objectives.ts';
import { ObjectiveFilter } from '#lib/objectives/objective-filter.ts';
import type { ObjectivesState } from '#lib/objectives/objectives-view.ts';

export const objectivesLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type ObjectivesLoaderProps = z.input<typeof objectivesLoaderPropsSchema>;

export type ObjectivesLoadEvent = Pick<ServerLoadEvent, 'fetch' | 'url'>;

/** The objectives as Mission Control last read them, before home knows whether GitHub is connected. */
export type ObjectivesRead =
  | Omit<Extract<ObjectivesState, { status: 'loaded' }>, 'githubConnected'>
  | Extract<ObjectivesState, { status: 'failed' }>;

/** Reads home's objectives with the statuses the page's `?show=` asks for. A failed read never fails the page. */
export interface ObjectivesLoader {
  readonly read: (event: ObjectivesLoadEvent) => Promise<ObjectivesRead>;
}

export class MissionControlObjectivesLoader implements ObjectivesLoader {
  private readonly apiBaseUrl: string;

  constructor(props: ObjectivesLoaderProps) {
    this.apiBaseUrl = objectivesLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly read = async (
    event: ObjectivesLoadEvent,
  ): Promise<ObjectivesRead> => {
    const filter = new ObjectiveFilter({ url: event.url });
    const client = this.client(event);
    try {
      const objectives = await client.list({ statuses: filter.statuses });
      return {
        status: 'loaded',
        objectives,
        anyInitiative:
          objectives.initiatives.length > 0 ||
          (!filter.showsEverything && (await this.anyHidden(client))),
      };
    } catch (error) {
      console.warn(`Mission Control did not send objectives: ${String(error)}`);
      return { status: 'failed' };
    }
  };

  /** Only asked when the filtered list is empty, to tell “none yet” from “all hidden”. */
  private async anyHidden(client: ObjectivesClient): Promise<boolean> {
    const everything = await client.list({
      statuses: ['active', 'parked', 'done'],
    });
    return everything.initiatives.length > 0;
  }

  private client(event: ObjectivesLoadEvent): ObjectivesClient {
    return new HttpObjectives({ baseUrl: this.apiBaseUrl, fetch: event.fetch });
  }
}
