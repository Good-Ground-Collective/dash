import { type ActionFailure, fail, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { missionControlBaseUrlSchema } from '#lib/api/mission-control.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import {
  HttpWatchedChecks,
  type WatchedChecksClient,
} from '#lib/api/watched-checks/watched-checks.ts';
import { RepositoryCheckChoices } from '#lib/watched-checks/repository-check-choices.ts';
import { WatchedChecksForms } from '#lib/watched-checks/watched-checks-forms.ts';

export const watchedChecksActionPropsSchema = z.object({
  apiBaseUrl: missionControlBaseUrlSchema,
});

export type WatchedChecksActionProps = z.input<
  typeof watchedChecksActionPropsSchema
>;

export type WatchedChecksActionEvent = Pick<RequestEvent, 'fetch' | 'request'>;

/** What a form action answers: which form it was, and why it didn't go through, or `null`. A repository save also says which repository it was for. */
export interface WatchedChecksResult {
  watched: { form: string; message: string | null; repository?: string };
}

type Reply = WatchedChecksResult | ActionFailure<WatchedChecksResult>;

const refusals = new Map<string, string>([
  ['SIGN_IN_REQUIRED', 'Sign in again to change this.'],
  [
    'WATCH_RULE_NOT_FOUND',
    'That rule is already gone. Reload to see the latest.',
  ],
  [
    'FST_ERR_VALIDATION',
    'Dash can’t watch that. Use a check name, or a prefix ending in one *.',
  ],
]);

/** Settings’ `?/addRule`, `?/removeRule` and `?/saveRepository` form actions: change which checks the person watches through Mission Control, from the web server. */
export interface WatchedChecksAction {
  readonly addRule: (event: WatchedChecksActionEvent) => Promise<Reply>;
  readonly removeRule: (event: WatchedChecksActionEvent) => Promise<Reply>;
  readonly saveRepository: (event: WatchedChecksActionEvent) => Promise<Reply>;
}

export class MissionControlWatchedChecksAction implements WatchedChecksAction {
  private readonly apiBaseUrl: string;

  constructor(props: WatchedChecksActionProps) {
    this.apiBaseUrl = watchedChecksActionPropsSchema.parse(props).apiBaseUrl;
  }

  readonly addRule = async (
    event: WatchedChecksActionEvent,
  ): Promise<Reply> => {
    const form = WatchedChecksForms.addRule(await event.request.formData());
    if (form === null) {
      return fail(400, {
        watched: {
          form: 'addRule',
          message: refusals.get('FST_ERR_VALIDATION') ?? null,
        },
      });
    }
    return this.run({
      form: 'addRule',
      change: async () => {
        await this.client(event).addRule(form);
      },
    });
  };

  readonly removeRule = async (
    event: WatchedChecksActionEvent,
  ): Promise<Reply> => {
    const form = WatchedChecksForms.removeRule(await event.request.formData());
    if (form === null) {
      return fail(400, {
        watched: {
          form: 'removeRule',
          message: 'That isn’t a rule Dash can remove.',
        },
      });
    }
    return this.run({
      form: 'removeRule',
      change: async () => {
        await this.client(event).removeRule(form);
      },
    });
  };

  readonly saveRepository = async (
    event: WatchedChecksActionEvent,
  ): Promise<Reply> => {
    const form = WatchedChecksForms.repository(await event.request.formData());
    if (form === null) {
      return fail(400, {
        watched: {
          form: 'saveRepository',
          message: 'That isn’t a change Dash can save.',
        },
      });
    }
    const client = this.client(event);
    return this.run({
      form: 'saveRepository',
      repository: form.repository,
      change: async () => {
        const changes = RepositoryCheckChoices.changes({
          repository: form.repository,
          chosen: await client.read(),
          submitted: form.choices,
        });
        for (const { checkName, mode } of changes.set) {
          await client.setOverride({
            repository: form.repository,
            checkName,
            mode,
          });
        }
        for (const { checkName } of changes.clear) {
          await client.clearOverride({
            repository: form.repository,
            checkName,
          });
        }
      },
    });
  };

  private async run(props: {
    form: string;
    repository?: string;
    change: () => Promise<void>;
  }): Promise<Reply> {
    const repository =
      props.repository === undefined ? {} : { repository: props.repository };
    try {
      await props.change();
      return { watched: { form: props.form, message: null, ...repository } };
    } catch (error) {
      const known =
        error instanceof MissionControlError
          ? refusals.get(error.code)
          : undefined;
      if (known === undefined) {
        console.warn(
          `Mission Control did not save watched checks: ${String(error)}`,
        );
      }
      const status = error instanceof MissionControlError ? error.status : 502;
      return fail(status >= 400 && status < 600 ? status : 502, {
        watched: {
          form: props.form,
          message: known ?? 'Mission Control didn’t save that. Try again.',
          ...repository,
        },
      });
    }
  }

  private client(event: WatchedChecksActionEvent): WatchedChecksClient {
    return new HttpWatchedChecks({
      baseUrl: this.apiBaseUrl,
      fetch: event.fetch,
    });
  }
}
