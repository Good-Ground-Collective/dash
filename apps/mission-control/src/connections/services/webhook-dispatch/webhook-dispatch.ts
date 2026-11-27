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
/** Workflows started for one delivery before it is given up on, one a minute at most. */
const maxDispatchAttempts = 10;
const failedStatuses: ReadonlySet<string> = new Set([
  'ERROR',
  'MAX_RECOVERY_ATTEMPTS_EXCEEDED',
  'CANCELLED',
]);
/** A provider outage of a few seconds is retried inside the workflow: after 1, 2 and 4 seconds. */
const retriedStep = {
  retriesAllowed: true,
  maxAttempts: 4,
  intervalSeconds: 1,
  backoffRate: 2,
};

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
 * One DBOS workflow per attempt at a delivery: it brings the connection up to date with any
 * change to its installation, runs each registered handler, and only then marks the delivery
 * dispatched. A delivery is stored pending before its first attempt starts. Every minute a
 * schedule looks at each delivery still pending: it starts the first attempt if a crash kept
 * it from starting, leaves a running attempt alone, and starts another after one that failed,
 * up to ten, so neither a crash nor a provider outage loses a change.
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
    await this.startAttempt({ delivery, attempt: 1 });
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
        async (firedAt: Date) => this.redispatch(firedAt),
        { name: 'webhookRedispatch' },
      ),
    };
  }

  private async startAttempt(props: {
    delivery: DispatchedDelivery;
    attempt: number;
  }): Promise<void> {
    if (this.registered === null) {
      throw new WebhookWorkflowsNotRegisteredError();
    }
    await DBOS.startWorkflow(this.registered.dispatch, {
      workflowID: DbosWebhookDispatch.workflowId(props),
      queueName,
    })(props.delivery);
  }

  private async process(delivery: DispatchedDelivery): Promise<void> {
    const { provider, deliveryId, installationId, installationChange } =
      delivery;
    if (installationId !== null && installationChange !== null) {
      await DBOS.runStep(
        () =>
          this.changes.apply({
            provider,
            installationId,
            change: installationChange,
          }),
        { ...retriedStep, name: 'webhookApplyInstallationChange' },
      );
    }

    for (const handler of this.registry.handlersFor(delivery)) {
      await handler.handle(delivery);
    }

    await DBOS.runStep(
      () => this.deliveries.markDispatched({ provider, deliveryId }),
      { ...retriedStep, name: 'webhookMarkDispatched' },
    );
  }

  private async redispatch(firedAt: Date): Promise<void> {
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
      await this.retry(delivery);
    }
  }

  /** Starts the first attempt that never started, unless an earlier one is running or succeeded. */
  private async retry(delivery: DispatchedDelivery): Promise<void> {
    for (let attempt = 1; attempt <= maxDispatchAttempts; attempt += 1) {
      const status = await DBOS.getWorkflowStatus(
        DbosWebhookDispatch.workflowId({ delivery, attempt }),
      );
      if (status === null) {
        await this.startAttempt({ delivery, attempt });
        return;
      }
      if (!failedStatuses.has(status.status)) {
        return;
      }
    }

    DBOS.logger.warn(
      `Giving up on webhook delivery ${delivery.deliveryId} after ${maxDispatchAttempts} failed attempts`,
    );
    await DBOS.runStep(
      () =>
        this.deliveries.markDispatched({
          provider: delivery.provider,
          deliveryId: delivery.deliveryId,
        }),
      { name: 'webhookAbandonDispatch' },
    );
  }

  private static workflowId(props: {
    delivery: DispatchedDelivery;
    attempt: number;
  }): string {
    const { provider, deliveryId } = props.delivery;
    return `webhook-${provider}-${deliveryId}-${props.attempt}`;
  }
}
