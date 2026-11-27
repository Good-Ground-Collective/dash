import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm';

import {
  connectionRepositoryTable,
  connectionTable,
} from '#src/connections/repositories/connections/connections-table.ts';
import type { GithubRecords } from '#src/github-feed/contracts/github-records.ts';
import type { GithubSyncTarget } from '#src/github-feed/contracts/github-source.ts';
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
import { githubRecordRows } from '#src/github-feed/repositories/github-records/github-record-rows.ts';
import type { Database } from '#src/platform/services/database/database.ts';

/** A GitHub connection a person made, how its reads went, and what the last good one found. */
export interface ConnectionRecords {
  connectionId: string;
  kind: 'owned' | 'guest';
  accountLogin: string;
  viewerLogin: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  records: GithubRecords;
}

export interface GithubRecordReader {
  /** GitHub connections to read, least recently tried first, so a capped run still reaches every one in turn. */
  syncTargets(props: {
    connectionId?: string;
    connectedBy?: string;
    limit: number;
  }): Promise<GithubSyncTarget[]>;
  /** Every GitHub connection `connectedBy` made, owned or guest, with its stored records. */
  recordsFor(props: { connectedBy: string }): Promise<ConnectionRecords[]>;
}

export class DrizzleGithubRecordReader implements GithubRecordReader {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async syncTargets(props: {
    connectionId?: string;
    connectedBy?: string;
    limit: number;
  }): Promise<GithubSyncTarget[]> {
    const rows = await this.database.orm
      .select({ connection: connectionTable })
      .from(connectionTable)
      .leftJoin(
        githubSyncTable,
        eq(githubSyncTable.connectionId, connectionTable.id),
      )
      .where(and(...DrizzleGithubRecordReader.connectionFilter(props)))
      .orderBy(sql`${githubSyncTable.lastAttemptedAt} asc nulls first`)
      .limit(props.limit);
    const ids = rows.map(({ connection }) => connection.id);
    const repositories =
      ids.length === 0
        ? []
        : await this.database.orm
            .select()
            .from(connectionRepositoryTable)
            .where(
              and(
                inArray(connectionRepositoryTable.connectionId, ids),
                eq(connectionRepositoryTable.archived, false),
              ),
            )
            .orderBy(asc(connectionRepositoryTable.fullName));

    return rows.map(({ connection }) => ({
      connectionId: connection.id,
      kind: connection.kind,
      installationId: connection.installationId,
      account: { login: connection.accountLogin, kind: connection.accountKind },
      connectedBy: connection.connectedBy,
      suspended: connection.suspended,
      repositories: repositories
        .filter((repository) => repository.connectionId === connection.id)
        .map((repository) => repository.fullName),
    }));
  }

  async recordsFor(props: {
    connectedBy: string;
  }): Promise<ConnectionRecords[]> {
    const connections = await this.database.orm
      .select({ connection: connectionTable, sync: githubSyncTable })
      .from(connectionTable)
      .leftJoin(
        githubSyncTable,
        eq(githubSyncTable.connectionId, connectionTable.id),
      )
      .where(
        and(
          eq(connectionTable.provider, 'github'),
          eq(connectionTable.connectedBy, props.connectedBy),
        ),
      )
      .orderBy(asc(connectionTable.accountLogin));
    const records = await this.recordsByConnection(
      connections.map(({ connection }) => connection.id),
    );

    return connections.map(({ connection, sync }) => ({
      connectionId: connection.id,
      kind: connection.kind,
      accountLogin: connection.accountLogin,
      viewerLogin: sync?.viewerLogin ?? null,
      lastSyncedAt: sync?.lastSyncedAt?.toISOString() ?? null,
      lastError: sync?.lastError ?? null,
      records:
        records.get(connection.id) ?? DrizzleGithubRecordReader.noRecords(),
    }));
  }

  private async recordsByConnection(
    ids: readonly string[],
  ): Promise<Map<string, GithubRecords>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.rowsWithin(ids);
    const of = <T extends { connectionId: string }>(
      table: readonly T[],
      id: string,
    ) => table.filter((row) => row.connectionId === id);

    return new Map(
      ids.map((id) => [
        id,
        {
          repositories: of(rows.repositories, id).map(
            githubRecordRows.repository,
          ),
          pullRequests: of(rows.pullRequests, id).map(
            githubRecordRows.pullRequest,
          ),
          reviewRequests: of(rows.reviewRequests, id).map(
            githubRecordRows.reviewRequest,
          ),
          checkRollups: of(rows.checkRollups, id).map(
            githubRecordRows.checkRollup,
          ),
          workflowRuns: of(rows.workflowRuns, id).map(
            githubRecordRows.workflowRun,
          ),
          issues: of(rows.issues, id).map(githubRecordRows.issue),
          assignments: of(rows.assignments, id).map(
            githubRecordRows.assignment,
          ),
        },
      ]),
    );
  }

  private async rowsWithin(ids: readonly string[]) {
    const orm = this.database.orm;
    const within = [...ids];
    const [repositories, pullRequests, reviewRequests, checkRollups] =
      await Promise.all([
        orm
          .select()
          .from(githubRepoTable)
          .where(inArray(githubRepoTable.connectionId, within)),
        orm
          .select()
          .from(githubPullRequestTable)
          .where(inArray(githubPullRequestTable.connectionId, within)),
        orm
          .select()
          .from(githubReviewRequestTable)
          .where(inArray(githubReviewRequestTable.connectionId, within)),
        orm
          .select()
          .from(githubCheckRollupTable)
          .where(inArray(githubCheckRollupTable.connectionId, within)),
      ]);
    const [workflowRuns, issues, assignments] = await Promise.all([
      orm
        .select()
        .from(githubWorkflowRunTable)
        .where(inArray(githubWorkflowRunTable.connectionId, within)),
      orm
        .select()
        .from(githubIssueTable)
        .where(inArray(githubIssueTable.connectionId, within)),
      orm
        .select()
        .from(githubAssignmentTable)
        .where(inArray(githubAssignmentTable.connectionId, within)),
    ]);
    return {
      repositories,
      pullRequests,
      reviewRequests,
      checkRollups,
      workflowRuns,
      issues,
      assignments,
    };
  }

  private static connectionFilter(props: {
    connectionId?: string;
    connectedBy?: string;
  }): SQL[] {
    return [
      eq(connectionTable.provider, 'github'),
      ...(props.connectionId === undefined
        ? []
        : [eq(connectionTable.id, props.connectionId)]),
      ...(props.connectedBy === undefined
        ? []
        : [eq(connectionTable.connectedBy, props.connectedBy)]),
    ];
  }

  private static noRecords(): GithubRecords {
    return {
      repositories: [],
      pullRequests: [],
      reviewRequests: [],
      checkRollups: [],
      workflowRuns: [],
      issues: [],
      assignments: [],
    };
  }
}
