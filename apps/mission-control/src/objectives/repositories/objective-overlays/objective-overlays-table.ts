import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';

/**
 * What a person keeps in Dash beside their trackers: parking, manual progress, and the
 * priority or due date a tracker lacks. Keyed on the tracker's node id and never touched by
 * a sync, so it outlives re-reads and even a reconnect.
 */
export const objectiveOverlayTable = pgTable(
  'objective_overlay',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => userTable.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    parked: boolean('parked').notNull().default(false),
    manualProgress: integer('manual_progress'),
    priority: text('priority', { enum: ['P1', 'P2', 'P3'] }),
    dueDate: date('due_date', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.nodeId] }),
    check(
      'objective_overlay_manual_progress_check',
      sql`${table.manualProgress} between 0 and 100`,
    ),
    check(
      'objective_overlay_priority_check',
      sql`${table.priority} in ('P1', 'P2', 'P3')`,
    ),
  ],
);
