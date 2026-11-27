import type { Repository } from '@dash/integrations-core';
import { asc, eq, inArray } from 'drizzle-orm';

import type { OwnedConnection } from '#src/connections/contracts/connections.ts';
import {
  connectionRepositoryTable,
  type connectionTable,
} from '#src/connections/repositories/connections/connections-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

type ConnectionRow = typeof connectionTable.$inferSelect;
type RepositoryRow = typeof connectionRepositoryTable.$inferSelect;
type Transaction = Parameters<Parameters<Database['orm']['transaction']>[0]>[0];

/** Stored connection rows: read back as connections, and a connection's repositories rewritten. */
export class ConnectionRows {
  static owned(props: {
    row: ConnectionRow;
    repositories: readonly RepositoryRow[];
  }): OwnedConnection {
    const { row } = props;
    return {
      id: row.id,
      provider: row.provider,
      kind: 'owned',
      installationId: row.installationId ?? '',
      account: {
        provider: row.provider,
        externalId: row.accountExternalId,
        url: row.accountUrl,
        login: row.accountLogin,
        kind: row.accountKind,
      },
      repositorySelection: row.repositorySelection ?? 'selected',
      repositories: props.repositories.map((repository) => ({
        provider: row.provider,
        externalId: repository.externalId,
        url: repository.url,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        archived: repository.archived,
      })),
      suspended: row.suspended,
      settingsUrl: row.settingsUrl ?? row.accountUrl,
      connectedAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  static async repositoriesOf(props: {
    orm: Database['orm'];
    connectionIds: readonly string[];
  }): Promise<RepositoryRow[]> {
    if (props.connectionIds.length === 0) {
      return [];
    }
    return props.orm
      .select()
      .from(connectionRepositoryTable)
      .where(
        inArray(connectionRepositoryTable.connectionId, [
          ...props.connectionIds,
        ]),
      )
      .orderBy(asc(connectionRepositoryTable.fullName));
  }

  static async replaceRepositories(props: {
    transaction: Transaction;
    connectionId: string;
    repositories: readonly Repository[];
  }): Promise<RepositoryRow[]> {
    const { transaction, connectionId } = props;
    await transaction
      .delete(connectionRepositoryTable)
      .where(eq(connectionRepositoryTable.connectionId, connectionId));
    if (props.repositories.length === 0) {
      return [];
    }
    return transaction
      .insert(connectionRepositoryTable)
      .values(
        props.repositories.map((repository) => ({
          connectionId,
          externalId: repository.externalId,
          fullName: repository.fullName,
          url: repository.url,
          defaultBranch: repository.defaultBranch,
          archived: repository.archived,
        })),
      )
      .returning();
  }
}
