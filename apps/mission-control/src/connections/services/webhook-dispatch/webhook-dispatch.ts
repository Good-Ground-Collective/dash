import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import {
  type DispatchedDelivery,
  dispatchedDeliverySchema,
} from '#src/connections/contracts/webhook-events.ts';
import { WebhookWorkflowsNotRegisteredError } from '#src/connections/errors.ts';
import type { WebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import type { InstallationChanges } from '#src/connections/services/installation-changes/installation-changes.ts';
import type { WebhookEventRegistry } from '#src/connections/services/webhook-event-registry/webhook-event-registry.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const queueName = 'webhook-dispatch';
const redispatchScheduleName = 'webhook-redispatch-every-minute';
/** A delivery stored this recently may still be on its way to its workflow. */
const redispatchGraceMilliseconds = 60_000;
const redispatchBatchSize = 100;

const webhookDispatchPropsSchema = z.object({
  registry: z.custom<WebhookEventRegistry>(),
  deliveries: z.custom<WebhookDeliveryRepository>(),
  changes: z.custom<InstallationChanges>(),
});

type DispatchWorkflow = (delivery: DispatchedDelivery) => Promise<void>;
type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/** Processes stored webhook deliveries away from the request that received them. */
export interface WebhookDispatch {
  /** Whether Dash does anything with the delivery beyond storing it. */
  handles(delivery: DispatchedDelivery): boolean;
  /** Starts the delivery's processing once, however often it is called for the same delivery. */
  start(delivery: DispatchedDelivery): Promise<void>;
}

/**
 * One DBOS workflow per delivery, keyed by its delivery id: it brings the connection up to date
 * with any change to its installation, then runs each registered handler. The delivery is stored
 * marked pending before its workflow starts, and every minute a schedule starts any delivery
 * still pending, so a crash between the two loses nothing.
 */
export class DbosWebhookDispatch implements WebhookDispatch, WorkflowModule {
  private readonly registry: WebhookEventRegistry;
  private readonly deliveries: WebhookDeliveryRepository;
  private readonly changes: InstallationChanges;
  private registered: {
    dispatch: DispatchWorkflow;
    redispatch: ScheduledWorkflow;
  } | null = null;

  constructor(props: z.input<typeof webhookDispatchPropsSchema>) {
    const parsed = webhookDispatchPropsSchema.parse(props);
    this.registry = parsed.registry;
    this.deliveries = parsed.deliveries;
    this.changes = parsed.changes;
  }

  handles(delivery: DispatchedDelivery): boolean {
    return (
      (delivery.installationId !== null &&
        delivery.installationChange !== null) ||
      this.registry.handlersFor(delivery).length > 0
    );
  }

  async start(delivery: DispatchedDelivery): Promise<void> {
    if (this.registered === null) {
      throw new WebhookWorkflowsNotRegisteredError();
    }
    await DBOS.startWorkflow(this.registered.dispatch, {
      workflowID: `webhook-${delivery.provider}-${delivery.deliveryId}`,
      queueName,
    })(delivery);
  }

  async activate(): Promise<void> {
    if (this.registered === null) {
      throw new WebhookWorkflowsNotRegisteredError();
    }
    await DBOS.registerQueue(queueName, { workerConcurrency: 10 });
    await DBOS.applySchedules([
      {
        scheduleName: redispatchScheduleName,
        workflowFn: this.registered.redispatch,
        schedule: '0 * * * * *',
      },
    ]);
  }

  registerWorkflows(): void {
    this.registered = {
      dispatch: DBOS.registerWorkflow(
        async (delivery: DispatchedDelivery) => this.process(delivery),
        {
          name: 'webhookDispatch',
          inputSchema: z.tuple([dispatchedDeliverySchema]),
        },
      ),
      redispatch: DBOS.registerWorkflow(
        async (firedAt: Date) => {
          const pending = await DBOS.runStep(
            () =>
              this.deliveries.pendingDispatch({
                receivedBefore: new Date(
                  firedAt.getTime() - redispatchGraceMilliseconds,
                ),
                limit: redispatchBatchSize,
              }),
            { name: 'webhookPendingDispatch' },
          );
          for (const delivery of pending) {
            await this.start(delivery);
          }
        },
        { name: 'webhookRedispatch' },
      ),
    };
  }

  private async process(delivery: DispatchedDelivery): Promise<void> {
    const { provider, installationId, installationChange } = delivery;
    await DBOS.runStep(
      () =>
        this.deliveries.markDispatched({
          provider,
          deliveryId: delivery.deliveryId,
        }),
      { name: 'webhookMarkDispatched' },
    );
    if (installationId !== null && installationChange !== null) {
      await DBOS.runStep(
        () =>
          this.changes.apply({
            provider,
            installationId,
            change: installationChange,
          }),
        { name: 'webhookApplyInstallationChange' },
      );
    }

    for (const handler of this.registry.handlersFor(delivery)) {
      await handler.handle(delivery);
    }
  }
}
