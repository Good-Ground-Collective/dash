import type { Installation } from '@dash/integrations-core';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { OwnedConnection } from '#src/connections/contracts/connections.ts';
import { ConnectionNotStoredError } from '#src/connections/errors.ts';
import {
  connectionRepositoryTable,
  connectionTable,
  installRequestTable,
} from '#src/connections/repositories/connections/connections-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

type ConnectionRow = typeof connectionTable.$inferSelect;
type RepositoryRow = typeof connectionRepositoryTable.$inferSelect;

export interface ConnectionRepository {
  /** Creates or refreshes the connection for `installation`, replacing its repositories. */
  saveOwned(props: {
    provider: string;
    connectedBy: string;
    installation: Installation;
  }): Promise<OwnedConnection>;
  listOwned(props: { provider: string }): Promise<OwnedConnection[]>;
  recordInstallRequest(props: {
    userId: string;
    provider: string;
    accountExternalId: string;
  }): Promise<void>;
}

export class DrizzleConnectionRepository implements ConnectionRepository {
  private readonly database: Database;

  constructor(props: { database: Database }) {
    this.database = props.database;
  }

  async saveOwned(props: {
    provider: string;
    connectedBy: string;
    installation: Installation;
  }): Promise<OwnedConnection> {
    const { installation } = props;
    const columns = {
      accountExternalId: installation.account.externalId,
      accountLogin: installation.account.login,
      accountKind: installation.account.kind,
      accountUrl: installation.account.url,
      settingsUrl: installation.url,
      repositorySelection: installation.repositorySelection,
      suspended: installation.suspended,
      updatedAt: new Date(),
    };

    return this.database.orm.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(connectionTable)
        .values({
          ...columns,
          provider: props.provider,
          kind: 'owned',
          installationId: installation.externalId,
          connectedBy: props.connectedBy,
        })
        .onConflictDoUpdate({
          target: [connectionTable.provider, connectionTable.installationId],
          set: columns,
        })
        .returning();
      if (row === undefined) {
        throw new ConnectionNotStoredError();
      }

      await transaction
        .delete(connectionRepositoryTable)
        .where(eq(connectionRepositoryTable.connectionId, row.id));
      const repositories =
        installation.repositories.length === 0
          ? []
          : await transaction
              .insert(connectionRepositoryTable)
              .values(
                installation.repositories.map((repository) => ({
                  connectionId: row.id,
                  externalId: repository.externalId,
                  fullName: repository.fullName,
                  url: repository.url,
                  defaultBranch: repository.defaultBranch,
                  archived: repository.archived,
                })),
              )
              .returning();
      return this.toOwned({ row, repositories });
    });
  }

  async listOwned(props: { provider: string }): Promise<OwnedConnection[]> {
    const rows = await this.database.orm
      .select()
      .from(connectionTable)
      .where(
        and(
          eq(connectionTable.provider, props.provider),
          eq(connectionTable.kind, 'owned'),
        ),
      )
      .orderBy(asc(connectionTable.accountLogin));
    const repositories =
      rows.length === 0
        ? []
        : await this.database.orm
            .select()
            .from(connectionRepositoryTable)
            .where(
              inArray(
                connectionRepositoryTable.connectionId,
                rows.map((row) => row.id),
              ),
            )
            .orderBy(asc(connectionRepositoryTable.fullName));
    return rows.map((row) =>
      this.toOwned({
        row,
        repositories: repositories.filter(
          (repository) => repository.connectionId === row.id,
        ),
      }),
    );
  }

  async recordInstallRequest(props: {
    userId: string;
    provider: string;
    accountExternalId: string;
  }): Promise<void> {
    await this.database.orm
      .insert(installRequestTable)
      .values(props)
      .onConflictDoUpdate({
        target: [
          installRequestTable.userId,
          installRequestTable.provider,
          installRequestTable.accountExternalId,
        ],
        set: { requestedAt: new Date() },
      });
  }

  private toOwned(props: {
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
}
