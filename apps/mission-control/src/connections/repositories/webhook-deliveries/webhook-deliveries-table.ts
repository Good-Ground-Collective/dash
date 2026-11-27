import type { WebhookPayload } from '@dash/integrations-core';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Every verified webhook delivery, keyed by the provider's delivery id so a redelivery is
 * recorded once. The payload is kept for debugging and deleted after seven days.
 * `dispatch_pending` stays true from the moment a delivery that needs processing is stored
 * until its processing succeeds or is given up on, so a crash or a failed attempt is picked up
 * again.
 */
export const webhookDeliveryTable = pgTable(
  'webhook_delivery',
  {
    provider: text('provider').notNull(),
    deliveryId: text('delivery_id').notNull(),
    event: text('event').notNull(),
    action: text('action'),
    installationId: text('installation_id'),
    installationChange: text('installation_change', {
      enum: ['removed', 'suspended', 'unsuspended', 'repositoriesChanged'],
    }),
    payload: jsonb('payload').$type<WebhookPayload>(),
    dispatchPending: boolean('dispatch_pending').notNull().default(false),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.deliveryId] }),
    index('webhook_delivery_received_at_idx').on(table.receivedAt),
  ],
);
