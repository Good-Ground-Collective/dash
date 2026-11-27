import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import { WebhookWorkflowsNotRegisteredError } from '#src/connections/errors.ts';
import type { WebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const retentionScheduleName = 'webhook-retention-daily';
const retentionMilliseconds = 7 * 24 * 60 * 60 * 1000;

const webhookRetentionPropsSchema = z.object({
  deliveries: z.custom<WebhookDeliveryRepository>(),
});

type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/** Stored deliveries are for debugging, so they are kept for seven days. */
export interface WebhookRetention {
  /** Deletes every delivery received more than seven days before `now`, and says how many went. */
  prune(props: { now: Date }): Promise<number>;
}

/** Prunes once a day, at 04:00 UTC. */
export class DbosWebhookRetention implements WebhookRetention, WorkflowModule {
  private readonly deliveries: WebhookDeliveryRepository;
  private scheduled: ScheduledWorkflow | null = null;

  constructor(props: z.input<typeof webhookRetentionPropsSchema>) {
    this.deliveries = webhookRetentionPropsSchema.parse(props).deliveries;
  }

  async prune(props: { now: Date }): Promise<number> {
    return this.deliveries.deleteReceivedBefore({
      cutoff: new Date(props.now.getTime() - retentionMilliseconds),
    });
  }

  async activate(): Promise<void> {
    if (this.scheduled === null) {
      throw new WebhookWorkflowsNotRegisteredError();
    }
    await DBOS.applySchedules([
      {
        scheduleName: retentionScheduleName,
        workflowFn: this.scheduled,
        schedule: '0 0 4 * * *',
      },
    ]);
  }

  registerWorkflows(): void {
    this.scheduled = DBOS.registerWorkflow(
      async (firedAt: Date) => {
        const pruned = await DBOS.runStep(() => this.prune({ now: firedAt }), {
          name: 'webhookPruneDeliveries',
        });
        if (pruned > 0) {
          DBOS.logger.info(`Deleted ${pruned} webhook deliveries`);
        }
      },
      { name: 'webhookRetention' },
    );
  }
}
