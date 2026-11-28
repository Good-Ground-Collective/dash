import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/**
 * Someone asked an organisation's owners to install the app on this account, through an
 * install link Dash made for it. Kept until the installation appears to them.
 */
export const installRequestTable = pgTable(
  'install_request',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    accountExternalId: text('account_external_id').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.provider, table.accountExternalId],
    }),
  ],
);
