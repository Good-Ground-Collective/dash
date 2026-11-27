import type { WebhookDelivery } from '@dash/integrations-core';

import { webhookDeliveryTable } from '#src/connections/repositories/webhook-deliveries/webhook-deliveries-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

export interface WebhookDeliveryRepository {
  /** Records the delivery once. `duplicate` is true when its id was already recorded. */
  record(props: {
    provider: string;
    delivery: WebhookDelivery;
  }): Promise<{ duplicate: boolean }>;
}

export class DrizzleWebhookDeliveryRepository implements WebhookDeliveryRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async record(props: {
    provider: string;
    delivery: WebhookDelivery;
  }): Promise<{ duplicate: boolean }> {
    const inserted = await this.database.orm
      .insert(webhookDeliveryTable)
      .values({
        provider: props.provider,
        deliveryId: props.delivery.deliveryId,
        event: props.delivery.event,
        installationId: props.delivery.installationId,
      })
      .onConflictDoNothing()
      .returning({ deliveryId: webhookDeliveryTable.deliveryId });
    return { duplicate: inserted.length === 0 };
  }
}
