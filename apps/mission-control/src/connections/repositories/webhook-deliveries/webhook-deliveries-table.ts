import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/** Every verified webhook delivery, keyed by the provider's delivery id so a redelivery is recorded once. */
export const webhookDeliveryTable = pgTable(
  'webhook_delivery',
  {
    provider: text('provider').notNull(),
    deliveryId: text('delivery_id').notNull(),
    event: text('event').notNull(),
    installationId: text('installation_id'),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.provider, table.deliveryId] })],
);
