import {
  and,
  eq,
  getTableColumns,
  isNull,
  lt,
  lte,
  type SQL,
  sql,
} from 'drizzle-orm';
import {
  getTableConfig,
  type PgColumn,
  type PgTable,
} from 'drizzle-orm/pg-core';

import type { GithubRecords } from '#src/github-feed/contracts/github-records.ts';
import {
  githubAssignmentTable,
  githubCheckRollupTable,
  githubIssueTable,
  githubPullRequestTable,
  githubRepoTable,
  githubReviewRequestTable,
  githubSyncTable,
  githubWorkflowRunTable,
} from '#src/github-feed/repositories/github-records/github-records-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

type Transaction = Parameters<Parameters<Database['orm']['transaction']>[0]>[0];

const prunedTables = [
  githubRepoTable,
  githubPullRequestTable,
  githubReviewRequestTable,
  githubCheckRollupTable,
  githubWorkflowRunTable,
  githubIssueTable,
  githubAssignmentTable,
] as const;

export interface GithubRecordWriter {
  /**
   * Upserts what a read found, keyed on GitHub node ids, and prunes every row of the
   * connection that read didn't report, such as closed pull requests and unassigned issues.
   * A read that started before the one already stored is dropped, so an overlapping slow
   * read never brings back rows a newer one pruned.
   */
  replace(props: {
    connectionId: string;
    viewerLogin: string;
    records: GithubRecords;
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

export class DrizzleGithubRecordWriter implements GithubRecordWriter {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async replace(props: {
    connectionId: string;
    viewerLogin: string;
    records: GithubRecords;
    truncated: boolean;
    syncedAt: Date;
  }): Promise<{ applied: boolean }> {
    const { connectionId, syncedAt } = props;
    return this.database.orm.transaction(async (transaction) => {
      await transaction
        .insert(githubSyncTable)
        .values({ connectionId, lastAttemptedAt: syncedAt })
        .onConflictDoNothing();
      const [stored] = await transaction
        .select({ lastSyncedAt: githubSyncTable.lastSyncedAt })
        .from(githubSyncTable)
        .where(eq(githubSyncTable.connectionId, connectionId))
        .for('update');
      if (
        stored?.lastSyncedAt !== null &&
        stored?.lastSyncedAt !== undefined &&
        stored.lastSyncedAt > syncedAt
      ) {
        return { applied: false };
      }

      await DrizzleGithubRecordWriter.upsertAll({ transaction, ...props });
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
      await DrizzleGithubRecordWriter.recordSync({ transaction, ...props });
      return { applied: true };
    });
  }

  async recordFailure(props: {
    connectionId: string;
    error: string;
    attemptedAt: Date;
  }): Promise<void> {
    await this.database.orm
      .insert(githubSyncTable)
      .values({
        connectionId: props.connectionId,
        lastAttemptedAt: props.attemptedAt,
        lastError: props.error,
      })
      .onConflictDoUpdate({
        target: githubSyncTable.connectionId,
        set: {
          lastAttemptedAt: sql.raw(
            'greatest("github_sync"."last_attempted_at", excluded."last_attempted_at")',
          ),
          lastError: props.error,
        },
        setWhere: sql`${isNull(githubSyncTable.lastSyncedAt)} or ${lte(
          githubSyncTable.lastSyncedAt,
          props.attemptedAt,
        )}`,
      });
  }

  private static async recordSync(props: {
    transaction: Transaction;
    connectionId: string;
    viewerLogin: string;
    truncated: boolean;
    syncedAt: Date;
  }): Promise<void> {
    const sync = {
      viewerLogin: props.viewerLogin,
      lastSyncedAt: props.syncedAt,
      truncated: props.truncated,
    };
    await props.transaction
      .insert(githubSyncTable)
      .values({
        connectionId: props.connectionId,
        ...sync,
        lastAttemptedAt: props.syncedAt,
        lastError: null,
      })
      .onConflictDoUpdate({
        target: githubSyncTable.connectionId,
        set: {
          ...sync,
          lastAttemptedAt: sql.raw(
            'greatest("github_sync"."last_attempted_at", excluded."last_attempted_at")',
          ),
          lastError: sql.raw(
            'case when "github_sync"."last_attempted_at" > excluded."last_attempted_at" then "github_sync"."last_error" end',
          ),
        },
      });
  }

  private static async upsertAll(props: {
    transaction: Transaction;
    connectionId: string;
    records: GithubRecords;
    syncedAt: Date;
  }): Promise<void> {
    const { transaction, records } = props;
    const stamp = {
      connectionId: props.connectionId,
      syncedAt: props.syncedAt,
    };
    const dated = <T extends { updatedAt: string }>(record: T) => ({
      ...record,
      ...stamp,
      updatedAt: new Date(record.updatedAt),
    });

    const stamped = <T extends object>(record: T) => ({ ...record, ...stamp });
    const writes = [
      { table: githubRepoTable, rows: records.repositories.map(stamped) },
      { table: githubPullRequestTable, rows: records.pullRequests.map(dated) },
      {
        table: githubReviewRequestTable,
        rows: records.reviewRequests.map(stamped),
      },
      {
        table: githubCheckRollupTable,
        rows: records.checkRollups.map(stamped),
      },
      { table: githubWorkflowRunTable, rows: records.workflowRuns.map(dated) },
      { table: githubIssueTable, rows: records.issues.map(dated) },
      { table: githubAssignmentTable, rows: records.assignments.map(stamped) },
    ] as const;

    for (const { table, rows } of writes) {
      if (rows.length > 0) {
        const target = getTableConfig(table).primaryKeys[0]?.columns ?? [];
        await transaction
          .insert(table)
          .values(rows)
          .onConflictDoUpdate({
            target,
            set: DrizzleGithubRecordWriter.excluded({ table, target }),
          });
      }
    }
  }

  /** Every column but the primary key, taken from the row that conflicted, so a repeated read overwrites in place. */
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
