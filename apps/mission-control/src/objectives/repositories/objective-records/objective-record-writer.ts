import { and, eq, isNull, lt, lte, sql } from 'drizzle-orm';

import type { ObjectiveRecords } from '#src/objectives/contracts/objective-records.ts';
import {
  objectiveActivityTable,
  objectiveEpicTable,
  objectiveInitiativeTable,
  objectivePlacementTable,
  objectiveSyncTable,
  objectiveTicketTable,
} from '#src/objectives/repositories/objective-records/objective-records-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';
import {
  ReplacedRows,
  type Transaction,
} from '#src/platform/services/replaced-rows/replaced-rows.ts';

const prunedTables = [
  objectiveInitiativeTable,
  objectiveEpicTable,
  objectivePlacementTable,
  objectiveTicketTable,
  objectiveActivityTable,
] as const;

const keptAttempt = sql.raw(
  'greatest("objective_sync"."last_attempted_at", excluded."last_attempted_at")',
);

export interface ObjectiveRecordWriter {
  /**
   * Upserts what a read found, keyed on tracker node ids, and prunes every row of the
   * connection that read didn't report. Dash's overlays live elsewhere and are never pruned.
   * A read that started before the one already stored is dropped, so an overlapping slow
   * read never brings back rows a newer one pruned.
   */
  replace(props: {
    connectionId: string;
    records: ObjectiveRecords;
    truncated: boolean;
    syncedAt: Date;
  }): Promise<{ applied: boolean }>;
  /** Notes a failed read. The rows from the last good read stay, and a failure older than that read is dropped. */
  recordFailure(props: {
    connectionId: string;
    error: string;
    attemptedAt: Date;
  }): Promise<void>;
}

export class DrizzleObjectiveRecordWriter implements ObjectiveRecordWriter {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async replace(props: {
    connectionId: string;
    records: ObjectiveRecords;
    truncated: boolean;
    syncedAt: Date;
  }): Promise<{ applied: boolean }> {
    const { connectionId, syncedAt } = props;
    return this.database.orm.transaction(async (transaction) => {
      await transaction
        .insert(objectiveSyncTable)
        .values({ connectionId, lastAttemptedAt: syncedAt })
        .onConflictDoNothing();
      const [stored] = await transaction
        .select({ lastSyncedAt: objectiveSyncTable.lastSyncedAt })
        .from(objectiveSyncTable)
        .where(eq(objectiveSyncTable.connectionId, connectionId))
        .for('update');
      if (
        stored?.lastSyncedAt !== null &&
        stored?.lastSyncedAt !== undefined &&
        stored.lastSyncedAt > syncedAt
      ) {
        return { applied: false };
      }

      await DrizzleObjectiveRecordWriter.upsertAll({ transaction, ...props });
      for (const table of prunedTables) {
        await transaction
          .delete(table)
          .where(
            and(
              eq(table.connectionId, connectionId),
              lt(table.syncedAt, syncedAt),
            ),
          );
      }
      await DrizzleObjectiveRecordWriter.recordSync({ transaction, ...props });
      return { applied: true };
    });
  }

  async recordFailure(props: {
    connectionId: string;
    error: string;
    attemptedAt: Date;
  }): Promise<void> {
    await this.database.orm
      .insert(objectiveSyncTable)
      .values({
        connectionId: props.connectionId,
        lastAttemptedAt: props.attemptedAt,
        lastError: props.error,
      })
      .onConflictDoUpdate({
        target: objectiveSyncTable.connectionId,
        set: { lastAttemptedAt: keptAttempt, lastError: props.error },
        setWhere: sql`${isNull(objectiveSyncTable.lastSyncedAt)} or ${lte(
          objectiveSyncTable.lastSyncedAt,
          props.attemptedAt,
        )}`,
      });
  }

  private static async recordSync(props: {
    transaction: Transaction;
    connectionId: string;
    truncated: boolean;
    syncedAt: Date;
  }): Promise<void> {
    const sync = { lastSyncedAt: props.syncedAt, truncated: props.truncated };
    await props.transaction
      .insert(objectiveSyncTable)
      .values({
        connectionId: props.connectionId,
        ...sync,
        lastAttemptedAt: props.syncedAt,
        lastError: null,
      })
      .onConflictDoUpdate({
        target: objectiveSyncTable.connectionId,
        set: {
          ...sync,
          lastAttemptedAt: keptAttempt,
          lastError: sql.raw(
            'case when "objective_sync"."last_attempted_at" > excluded."last_attempted_at" then "objective_sync"."last_error" end',
          ),
        },
      });
  }

  private static async upsertAll(props: {
    transaction: Transaction;
    connectionId: string;
    records: ObjectiveRecords;
    syncedAt: Date;
  }): Promise<void> {
    const { transaction, records } = props;
    const stamp = {
      connectionId: props.connectionId,
      syncedAt: props.syncedAt,
    };
    const stamped = <T extends object>(record: T) => ({ ...record, ...stamp });
    const dated = <T extends { lastActivityAt: string }>(record: T) => ({
      ...stamped(record),
      lastActivityAt: new Date(record.lastActivityAt),
    });

    const writes = [
      { table: objectiveInitiativeTable, rows: records.initiatives.map(dated) },
      { table: objectiveEpicTable, rows: records.epics.map(dated) },
      { table: objectivePlacementTable, rows: records.placements.map(stamped) },
      { table: objectiveTicketTable, rows: records.tickets.map(dated) },
      {
        table: objectiveActivityTable,
        rows: records.activity.map((activity) => ({
          ...stamped(activity),
          occurredAt: new Date(activity.occurredAt),
        })),
      },
    ] as const;
    for (const { table, rows } of writes) {
      await ReplacedRows.upsert({ transaction, table, rows });
    }
  }
}
