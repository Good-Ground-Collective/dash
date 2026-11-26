import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/** What a `service` principal is for and who answers for it. One row per service principal: a bench (one per machine) or an agent, never both. */
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
  (table) => [
    index('service_profile_owner_user_id_idx').on(table.ownerUserId),
    uniqueIndex('service_profile_bench_id_idx').on(table.benchId),
    uniqueIndex('service_profile_agent_name_idx').on(table.agentName),
    check(
      'service_profile_bench_or_agent_check',
      sql`(${table.benchId} is null) <> (${table.agentName} is null)`,
    ),
  ],
);
