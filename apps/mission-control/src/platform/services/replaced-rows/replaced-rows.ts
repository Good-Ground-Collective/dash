import { getTableColumns, type SQL, sql } from 'drizzle-orm';
import {
  getTableConfig,
  type PgColumn,
  type PgInsertValue,
  type PgTable,
} from 'drizzle-orm/pg-core';

import type { Database } from '#src/platform/services/database/database.ts';

export type Transaction = Parameters<
  Parameters<Database['orm']['transaction']>[0]
>[0];

/** Upserts for tables a sync replaces whole: a repeated read overwrites each row in place, keyed on the table's primary key. */
export class ReplacedRows {
  static async upsert<T extends PgTable>(props: {
    transaction: Transaction;
    table: T;
    rows: readonly PgInsertValue<T>[];
  }): Promise<void> {
    if (props.rows.length === 0) {
      return;
    }
    const target = getTableConfig(props.table).primaryKeys[0]?.columns ?? [];
    await props.transaction
      .insert(props.table)
      .values([...props.rows])
      .onConflictDoUpdate({
        target,
        set: ReplacedRows.excluded({ table: props.table, target }),
      });
  }

  /** Every column but the primary key, taken from the row that conflicted. */
  private static excluded(props: {
    table: PgTable;
    target: readonly PgColumn[];
  }): Record<string, SQL> {
    return Object.fromEntries(
      Object.entries(getTableColumns(props.table))
        .filter(([, column]) => !props.target.includes(column))
        .map(([name, column]) => [name, sql.raw(`excluded."${column.name}"`)]),
    );
  }
}
