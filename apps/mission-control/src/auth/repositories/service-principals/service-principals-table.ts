import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/** What a `service` principal is for and who answers for it. One row per service principal. */
export const serviceProfileTable = pgTable(
  'service_profile',
  {
    principalId: uuid('principal_id')
      .primaryKey()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'restrict' }),
    benchId: text('bench_id'),
    agentName: text('agent_name'),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('service_profile_owner_user_id_idx').on(table.ownerUserId)],
);
