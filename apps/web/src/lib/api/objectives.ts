import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import {
  type Objectives,
  type ObjectiveStatus,
  objectivesSchema,
  type Overlay,
  type OverlayChanges,
  overlayChangesSchema,
  overlaySchema,
} from '#lib/api/objectives-contracts.ts';

export const httpObjectivesPropsSchema = z.object({
  baseUrl: missionControlBaseUrlSchema,
  fetch: z.custom<typeof fetch>((value) => value instanceof Function),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .default(5000)
    .describe(
      'Objectives are read from what Mission Control stored, so they never wait on the tracker.',
    ),
});

export type HttpObjectivesProps = z.input<typeof httpObjectivesPropsSchema>;

/** The signed-in person's initiatives and epics, and the overlay Dash keeps beside them. Failures are `MissionControlError`s. */
export interface ObjectivesClient {
  list(props: { statuses: readonly ObjectiveStatus[] }): Promise<Objectives>;
  /** Rejects with code `TRACKER_OWNS_FIELD` (409) when the tracker already sets a field, `OBJECTIVE_NOT_FOUND` (404) for an id outside the person's connections. */
  editOverlay(props: { id: string; changes: OverlayChanges }): Promise<Overlay>;
}

/** Calls Mission Control's `GET /objectives` and `PATCH /objectives/:id/overlay` with credentials, from the web server. */
export class HttpObjectives implements ObjectivesClient {
  private readonly endpoint: MissionControlEndpoint;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(props: HttpObjectivesProps) {
    const valid = httpObjectivesPropsSchema.parse(props);
    this.endpoint = new MissionControlEndpoint({ baseUrl: valid.baseUrl });
    this.fetcher = valid.fetch;
    this.timeoutMs = valid.timeoutMs;
  }

  async list(props: {
    statuses: readonly ObjectiveStatus[];
  }): Promise<Objectives> {
    const path = 'objectives';
    const url = this.endpoint.url(path);
    url.searchParams.set('status', props.statuses.join(','));
    const response = await this.fetcher(url, {
      credentials: 'include',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.endpoint.read({ path, response, schema: objectivesSchema });
  }

  async editOverlay(props: {
    id: string;
    changes: OverlayChanges;
  }): Promise<Overlay> {
    const path = `objectives/${encodeURIComponent(props.id)}/overlay`;
    const response = await this.fetcher(this.endpoint.url(path), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(overlayChangesSchema.parse(props.changes)),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.endpoint.read({ path, response, schema: overlaySchema });
  }
}
