import { type ActionFailure, fail, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { HttpObjectives, type ObjectivesClient } from '#lib/api/objectives.ts';
import {
  OverlayActions,
  type OverlayResult,
} from '#lib/objectives/overlay-actions.ts';

export const objectiveOverlayActionPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type ObjectiveOverlayActionProps = z.input<
  typeof objectiveOverlayActionPropsSchema
>;

export type OverlayActionEvent = Pick<RequestEvent, 'fetch' | 'request'>;

const refusals = new Map<string, string>([
  [
    'TRACKER_OWNS_FIELD',
    'GitHub already sets this, so change it there. Reload to see its value.',
  ],
  [
    'OBJECTIVE_NOT_FOUND',
    'Dash can’t find this any more. Reload to see the latest.',
  ],
  ['SIGN_IN_REQUIRED', 'Sign in again to change this.'],
]);

/** Home's `?/overlay` form action: parks, unparks and sets or clears Dash's own values through Mission Control, from the web server. */
export interface ObjectiveOverlayAction {
  readonly edit: (
    event: OverlayActionEvent,
  ) => Promise<OverlayResult | ActionFailure<OverlayResult>>;
}

export class MissionControlObjectiveOverlayAction implements ObjectiveOverlayAction {
  private readonly apiBaseUrl: string;

  constructor(props: ObjectiveOverlayActionProps) {
    this.apiBaseUrl = objectiveOverlayActionPropsSchema.parse(props).apiBaseUrl;
  }

  readonly edit = async (
    event: OverlayActionEvent,
  ): Promise<OverlayResult | ActionFailure<OverlayResult>> => {
    const form = OverlayActions.parseForm(await event.request.formData());
    if (form === null) {
      return fail(400, {
        overlay: { id: null, message: 'That change isn’t one Dash can make.' },
      });
    }

    try {
      await this.client(event).editOverlay(form);
      return { overlay: { id: form.id, message: null } };
    } catch (error) {
      const known =
        error instanceof MissionControlError
          ? refusals.get(error.code)
          : undefined;
      if (known === undefined) {
        console.warn(
          `Mission Control did not save an overlay: ${String(error)}`,
        );
      }
      const status = error instanceof MissionControlError ? error.status : 502;
      return fail(status >= 400 && status < 600 ? status : 502, {
        overlay: {
          id: form.id,
          message: known ?? 'Mission Control didn’t save that. Try again.',
        },
      });
    }
  };

  private client(event: OverlayActionEvent): ObjectivesClient {
    return new HttpObjectives({ baseUrl: this.apiBaseUrl, fetch: event.fetch });
  }
}
