import { and, eq, gte, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';

import type {
  GithubRecords,
  GithubReleaseRead,
} from '#src/github-feed/contracts/github-records.ts';
import { recentActivityRetentionMs } from '#src/github-feed/definitions/feed-retention/feed-retention.ts';
import {
  githubAssignmentTable,
  githubCheckRollupTable,
  githubCheckTable,
  githubIssueTable,
  githubPullRequestTable,
  githubReleaseTable,
  githubRepoTable,
  githubReviewRequestTable,
  githubSyncTable,
  githubWorkflowRunTable,
} from '#src/github-feed/repositories/github-records/github-records-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';
import {
  ReplacedRows,
  type Transaction,
} from '#src/platform/services/replaced-rows/replaced-rows.ts';

const prunedTables = [
  githubRepoTable,
  githubReviewRequestTable,
  githubCheckRollupTable,
  githubCheckTable,
  githubWorkflowRunTable,
  githubIssueTable,
  githubAssignmentTable,
] as const;

/**
 * failing_since is kept only across consecutive failing reads: a check that failed before and
 * fails again keeps the time it first failed, a new failure starts at the read time, and a
 * pending, success, neutral or skipped read clears it. A failure after a pending read starts afresh.
 */
const failingSinceKept = sql`case when excluded.${sql.identifier(githubCheckTable.failingSince.name)} is null then null when ${githubCheckTable.state} = 'failure' and ${githubCheckTable.failingSince} is not null then ${githubCheckTable.failingSince} else excluded.${sql.identifier(githubCheckTable.failingSince.name)} end`;

export interface GithubRecordWriter {
  /**
   * Upserts what a read found, keyed on GitHub node ids, and prunes every row of the
   * connection that read didn't report, such as closed pull requests and unassigned issues.
   * Pull requests merged and releases published within the retention before the read are
   * kept whether or not it reported them, and older ones age out. A release that a read
   * saw the repository's releases for, and did not report, was deleted or unpublished and
   * is dropped; `releaseReads` says which repositories that read saw and how far back.
   * A read that started before the one already stored is dropped, so an overlapping slow
   * read never brings back rows a newer one pruned.
   */
  replace(props: {
    connectionId: string;
    viewerLogin: string;
    records: GithubRecords;
    releaseReads: readonly GithubReleaseRead[];
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
    releaseReads: readonly GithubReleaseRead[];
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
      await DrizzleGithubRecordWriter.pruneRecent({ transaction, ...props });
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

  private static async pruneRecent(props: {
    transaction: Transaction;
    connectionId: string;
    releaseReads: readonly GithubReleaseRead[];
    syncedAt: Date;
  }): Promise<void> {
    const { transaction, connectionId, syncedAt, releaseReads } = props;
    const cutoff = new Date(syncedAt.getTime() - recentActivityRetentionMs);
    await transaction
      .delete(githubPullRequestTable)
      .where(
        and(
          eq(githubPullRequestTable.connectionId, connectionId),
          or(
            and(
              lt(githubPullRequestTable.syncedAt, syncedAt),
              or(
                ne(githubPullRequestTable.state, 'merged'),
                isNull(githubPullRequestTable.mergedAt),
                lt(githubPullRequestTable.mergedAt, cutoff),
              ),
            ),
            and(
              eq(githubPullRequestTable.state, 'merged'),
              lt(githubPullRequestTable.mergedAt, cutoff),
            ),
          ),
        ),
      );
    const unreported = DrizzleGithubRecordWriter.unreported(releaseReads);
    await transaction
      .delete(githubReleaseTable)
      .where(
        and(
          eq(githubReleaseTable.connectionId, connectionId),
          or(
            lt(githubReleaseTable.publishedAt, cutoff),
            unreported.length === 0
              ? undefined
              : and(
                  lt(githubReleaseTable.syncedAt, syncedAt),
                  or(...unreported),
                ),
          ),
        ),
      );
  }

  /** Matches the releases of each repository that a read saw them for, back as far as it could see. */
  private static unreported(releaseReads: readonly GithubReleaseRead[]) {
    return releaseReads.flatMap((read) => {
      const repository = eq(
        githubReleaseTable.repositoryNodeId,
        read.repositoryNodeId,
      );
      if (read.exhaustive) {
        return [repository];
      }
      return read.oldestPublishedAt === null
        ? []
        : [
            and(
              repository,
              gte(
                githubReleaseTable.publishedAt,
                new Date(read.oldestPublishedAt),
              ),
            ),
          ];
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

  private static async upsertChecks(props: {
    transaction: Transaction;
    connectionId: string;
    records: GithubRecords;
    syncedAt: Date;
  }): Promise<void> {
    await ReplacedRows.upsert({
      transaction: props.transaction,
      table: githubCheckTable,
      rows: props.records.checks.map((check) => ({
        ...check,
        connectionId: props.connectionId,
        syncedAt: props.syncedAt,
        failingSince: check.state === 'failure' ? props.syncedAt : null,
      })),
      overrides: { failingSince: failingSinceKept },
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
    const pullRequest = (record: GithubRecords['pullRequests'][number]) => ({
      ...dated(record),
      mergedAt: record.mergedAt === null ? null : new Date(record.mergedAt),
      createdAt: new Date(record.createdAt),
    });
    const release = (record: GithubRecords['releases'][number]) => ({
      ...record,
      ...stamp,
      publishedAt: new Date(record.publishedAt),
    });

    const stamped = <T extends object>(record: T) => ({ ...record, ...stamp });
    const writes = [
      { table: githubRepoTable, rows: records.repositories.map(stamped) },
      {
        table: githubPullRequestTable,
        rows: records.pullRequests.map(pullRequest),
      },
      { table: githubReleaseTable, rows: records.releases.map(release) },
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
      await ReplacedRows.upsert({ transaction, table, rows });
    }
    await DrizzleGithubRecordWriter.upsertChecks(props);
  }
}
