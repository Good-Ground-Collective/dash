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

const bindParameterBudget = 60_000;

/**
 * Upserts for tables a sync replaces whole: a repeated read overwrites each row in place, keyed on
 * the table's primary key. Large reads go in several statements on the caller's transaction. A
 * column named in `overrides` is set by the given expression instead of from the incoming row.
 */
export class ReplacedRows {
  static async upsert<T extends PgTable>(props: {
    transaction: Transaction;
    table: T;
    rows: readonly PgInsertValue<T>[];
    overrides?: Record<string, SQL>;
  }): Promise<void> {
    if (props.rows.length === 0) {
      return;
    }
    const target = getTableConfig(props.table).primaryKeys[0]?.columns ?? [];
    const set = Object.assign(
      ReplacedRows.excluded({ table: props.table, target }),
      props.overrides,
    );
    const perStatement = ReplacedRows.rowsPerStatement(props.table);
    for (let start = 0; start < props.rows.length; start += perStatement) {
      await props.transaction
        .insert(props.table)
        .values(props.rows.slice(start, start + perStatement))
        .onConflictDoUpdate({ target, set });
    }
  }

  /** Postgres binds at most 65,535 parameters to a statement, one per column of each row. */
  private static rowsPerStatement(table: PgTable): number {
    const columns = Object.keys(getTableColumns(table)).length;
    return Math.max(1, Math.floor(bindParameterBudget / columns));
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
