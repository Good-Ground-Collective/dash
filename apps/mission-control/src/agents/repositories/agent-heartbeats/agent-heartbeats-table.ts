import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/** Each heartbeat an agent reported with a service account key. Kept when the account is revoked. */
export const agentHeartbeatTable = pgTable(
  'agent_heartbeat',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentName: text('agent_name').notNull(),
    benchId: text('bench_id'),
    reportedBy: uuid('reported_by').references(() => userTable.id, {
      onDelete: 'set null',
    }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('agent_heartbeat_agent_name_received_at_idx').on(
      table.agentName,
      table.receivedAt,
    ),
  ],
);
