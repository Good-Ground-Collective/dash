import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const heartbeatsTable = pgTable('example_heartbeats', {
  id: uuid('id').primaryKey().defaultRandom(),
  firedAt: timestamp('fired_at', { withTimezone: true }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
