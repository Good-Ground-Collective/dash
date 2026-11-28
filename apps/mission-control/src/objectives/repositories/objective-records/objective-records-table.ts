import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { connectionTable } from '#src/connections/repositories/connections/connections-table.ts';

const stateEnum = { enum: ['open', 'closed'] as const };
const priorityEnum = { enum: ['P1', 'P2', 'P3'] as const };

/** Columns every objective table repeats. Each call builds fresh columns, as Drizzle needs one per table. */
class ObjectiveColumns {
  static connectionId() {
    return uuid('connection_id')
      .notNull()
      .references(() => connectionTable.id, { onDelete: 'cascade' });
  }

  static syncedAt() {
    return timestamp('synced_at', { withTimezone: true }).notNull();
  }

  static tracked() {
    return {
      connectionId: ObjectiveColumns.connectionId(),
      nodeId: text('node_id').notNull(),
      title: text('title').notNull(),
      url: text('url').notNull(),
      state: text('state', stateEnum).notNull(),
      priority: text('priority', priorityEnum),
      lastActivityAt: timestamp('last_activity_at', {
        withTimezone: true,
      }).notNull(),
      syncedAt: ObjectiveColumns.syncedAt(),
    };
  }
}

/** How the latest reads of a connection's tracker went. */
export const objectiveSyncTable = pgTable('objective_sync', {
  connectionId: uuid('connection_id')
    .primaryKey()
    .references(() => connectionTable.id, { onDelete: 'cascade' }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastAttemptedAt: timestamp('last_attempted_at', {
    withTimezone: true,
  }).notNull(),
  lastError: text('last_error'),
  truncated: boolean('truncated'),
});

/** A GitHub Project, or another tracker's initiative. */
export const objectiveInitiativeTable = pgTable(
  'objective_initiative',
  {
    ...ObjectiveColumns.tracked(),
    dueDate: date('due_date', { mode: 'string' }),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.nodeId] })],
);

export const objectiveEpicTable = pgTable(
  'objective_epic',
  {
    ...ObjectiveColumns.tracked(),
    dueDate: date('due_date', { mode: 'string' }),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.nodeId] })],
);

export const objectivePlacementTable = pgTable(
  'objective_placement',
  {
    connectionId: ObjectiveColumns.connectionId(),
    initiativeNodeId: text('initiative_node_id').notNull(),
    epicNodeId: text('epic_node_id').notNull(),
    syncedAt: ObjectiveColumns.syncedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.connectionId, table.initiativeNodeId, table.epicNodeId],
    }),
  ],
);

/** An epic's sub-issues, in the epic's order. */
export const objectiveTicketTable = pgTable(
  'objective_ticket',
  {
    ...ObjectiveColumns.tracked(),
    epicNodeId: text('epic_node_id').notNull(),
    position: integer('position').notNull(),
    assignees: text('assignees').array().notNull().default([]),
  },
  (table) => [primaryKey({ columns: [table.connectionId, table.nodeId] })],
);

/** The newest of each kind of activity on a ticket, for an epic's latest update. */
export const objectiveActivityTable = pgTable(
  'objective_activity',
  {
    connectionId: ObjectiveColumns.connectionId(),
    ticketNodeId: text('ticket_node_id').notNull(),
    kind: text('kind', {
      enum: ['ticket_closed', 'pull_request_merged', 'commented'],
    }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    actor: text('actor'),
    url: text('url').notNull(),
    syncedAt: ObjectiveColumns.syncedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.connectionId, table.ticketNodeId, table.kind],
    }),
  ],
);
