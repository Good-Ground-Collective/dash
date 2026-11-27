import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { connectionTable } from '#src/connections/repositories/connections/connections-table.ts';

/** The latest moment GitHub told Dash a connection's activity changed, so a read already under way can tell it missed something. */
export const githubSyncRequestTable = pgTable('github_sync_request', {
  connectionId: uuid('connection_id')
    .primaryKey()
    .references(() => connectionTable.id, { onDelete: 'cascade' }),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
});
