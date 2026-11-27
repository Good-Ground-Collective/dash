import type { WebhookDelivery } from '@dash/integrations-core';
import { and, asc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';

import type { DispatchedDelivery } from '#src/connections/contracts/webhook-events.ts';
import { webhookDeliveryTable } from '#src/connections/repositories/webhook-deliveries/webhook-deliveries-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

const repositoryPropsSchema = z.object({
  database: z.custom<Database>(),
});

export interface WebhookDeliveryRepository {
  /** Records the delivery once. `duplicate` is true when its id was already recorded. */
  record(props: {
    provider: string;
    delivery: WebhookDelivery;
    dispatchPending: boolean;
  }): Promise<{ duplicate: boolean }>;
  /** Notes that the delivery's processing finished, or was given up on, so it is not retried. */
  markDispatched(props: {
    provider: string;
    deliveryId: string;
  }): Promise<void>;
  /** Deliveries stored for processing that hasn't finished, oldest first. */
  pendingDispatch(props: {
    receivedBefore: Date;
    limit: number;
  }): Promise<DispatchedDelivery[]>;
  /** Deletes deliveries received before `cutoff` and says how many went. */
  deleteReceivedBefore(props: { cutoff: Date }): Promise<number>;
}

export class DrizzleWebhookDeliveryRepository implements WebhookDeliveryRepository {
  private readonly database: Database;

  constructor(props: z.input<typeof repositoryPropsSchema>) {
    this.database = repositoryPropsSchema.parse(props).database;
  }

  async record(props: {
    provider: string;
    delivery: WebhookDelivery;
    dispatchPending: boolean;
  }): Promise<{ duplicate: boolean }> {
    const { delivery } = props;
    const inserted = await this.database.orm
      .insert(webhookDeliveryTable)
      .values({
        provider: props.provider,
        deliveryId: delivery.deliveryId,
        event: delivery.event,
        action: delivery.action,
        installationId: delivery.installationId,
        installationChange: delivery.installationChange,
        payload: delivery.payload,
        dispatchPending: props.dispatchPending,
      })
      .onConflictDoNothing()
      .returning({ deliveryId: webhookDeliveryTable.deliveryId });
    return { duplicate: inserted.length === 0 };
  }

  async markDispatched(props: {
    provider: string;
    deliveryId: string;
  }): Promise<void> {
    await this.database.orm
      .update(webhookDeliveryTable)
      .set({ dispatchPending: false })
      .where(
        and(
          eq(webhookDeliveryTable.provider, props.provider),
          eq(webhookDeliveryTable.deliveryId, props.deliveryId),
        ),
      );
  }

  async pendingDispatch(props: {
    receivedBefore: Date;
    limit: number;
  }): Promise<DispatchedDelivery[]> {
    return this.database.orm
      .select({
        provider: webhookDeliveryTable.provider,
        deliveryId: webhookDeliveryTable.deliveryId,
        event: webhookDeliveryTable.event,
        action: webhookDeliveryTable.action,
        installationId: webhookDeliveryTable.installationId,
        installationChange: webhookDeliveryTable.installationChange,
      })
      .from(webhookDeliveryTable)
      .where(
        and(
          eq(webhookDeliveryTable.dispatchPending, true),
          lt(webhookDeliveryTable.receivedAt, props.receivedBefore),
        ),
      )
      .orderBy(asc(webhookDeliveryTable.receivedAt))
      .limit(props.limit);
  }

  async deleteReceivedBefore(props: { cutoff: Date }): Promise<number> {
    const deleted = await this.database.orm
      .delete(webhookDeliveryTable)
      .where(lt(webhookDeliveryTable.receivedAt, props.cutoff))
      .returning({ deliveryId: webhookDeliveryTable.deliveryId });
    return deleted.length;
  }
}
