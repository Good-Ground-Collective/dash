import type { ServerLoadEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { HttpNeedsYou } from '#lib/needs-you/http-needs-you.ts';
import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';
import type { NeedsYouSession } from '#lib/needs-you/needs-you-session-contracts.ts';

export const needsYouLoaderPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type NeedsYouLoaderProps = z.input<typeof needsYouLoaderPropsSchema>;

export type NeedsYouLoadEvent = Pick<ServerLoadEvent, 'fetch'>;

/** What is waiting on the viewer and the sessions it came from. */
export interface WaitingOnViewer {
  items: NeedsYouItem[];
  sessions: NeedsYouSession[];
}

/** Reads what is waiting on the viewer for the shell. A failed read never fails the page. */
export interface NeedsYouLoader {
  readonly read: (event: NeedsYouLoadEvent) => Promise<WaitingOnViewer>;
}

/** Lists the open items and, only when there are some, the sessions that say where each agent runs. The items still show without their sessions. */
export class MissionControlNeedsYouLoader implements NeedsYouLoader {
  private readonly apiBaseUrl: string;

  constructor(props: NeedsYouLoaderProps) {
    this.apiBaseUrl = needsYouLoaderPropsSchema.parse(props).apiBaseUrl;
  }

  readonly read = async (
    event: NeedsYouLoadEvent,
  ): Promise<WaitingOnViewer> => {
    const reads = new HttpNeedsYou({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
    try {
      const items = await reads.listOpen();
      if (items.length === 0) return { items, sessions: [] };
      return { items, sessions: await this.sessionsOf(reads) };
    } catch (error) {
      if (error instanceof MissionControlError && error.status === 401) {
        return { items: [], sessions: [] };
      }
      console.warn(
        `Mission Control did not list what needs the viewer: ${String(error)}`,
      );
      return { items: [], sessions: [] };
    }
  };

  private async sessionsOf(reads: HttpNeedsYou): Promise<NeedsYouSession[]> {
    try {
      return await reads.listSessions();
    } catch (error) {
      console.warn(
        `Mission Control did not list agent sessions: ${String(error)}`,
      );
      return [];
    }
  }
}
