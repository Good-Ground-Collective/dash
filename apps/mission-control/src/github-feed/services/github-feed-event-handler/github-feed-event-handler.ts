import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import type {
  DispatchedDelivery,
  WebhookEventHandler,
} from '#src/connections/contracts/webhook-events.ts';
import type { GithubReconcileWorkflows } from '#src/github-feed/services/github-reconcile-workflows/github-reconcile-workflows.ts';
import type { GithubSyncRequests } from '#src/github-feed/services/github-sync-requests/github-sync-requests.ts';

const githubFeedEventHandlerPropsSchema = z.object({
  event: z.string().min(1),
  actions: z.array(z.string().min(1)).readonly().nullable(),
  syncRequests: z.custom<Pick<GithubSyncRequests, 'request'>>(),
  workflows: z.custom<Pick<GithubReconcileWorkflows, 'syncConnection'>>(),
});

/** Reads a connection again when GitHub reports activity in its installation that the feed shows. */
export class GithubFeedEventHandler implements WebhookEventHandler {
  readonly provider = 'github';
  readonly event: string;
  readonly actions: readonly string[] | null;
  private readonly syncRequests: Pick<GithubSyncRequests, 'request'>;
  private readonly workflows: Pick<GithubReconcileWorkflows, 'syncConnection'>;

  constructor(props: z.input<typeof githubFeedEventHandlerPropsSchema>) {
    const parsed = githubFeedEventHandlerPropsSchema.parse(props);
    this.event = parsed.event;
    this.actions = parsed.actions;
    this.syncRequests = parsed.syncRequests;
    this.workflows = parsed.workflows;
  }

  async handle(delivery: DispatchedDelivery): Promise<void> {
    const { installationId } = delivery;
    if (installationId === null) {
      return;
    }
    const connectionId = await DBOS.runStep(
      () =>
        this.syncRequests.request({ installationId, requestedAt: new Date() }),
      { name: 'githubRequestSync' },
    );
    if (connectionId !== null) {
      await this.workflows.syncConnection({ connectionId });
    }
  }
}
