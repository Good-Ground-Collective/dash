import type { Installation } from '@dash/integrations-core';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { OwnedConnection } from '#src/connections/contracts/connections.ts';
import { ConnectionNotStoredError } from '#src/connections/errors.ts';
import {
  connectionRepositoryTable,
  connectionTable,
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
  /** Whether Dash has a connection for this installation of the provider's app. */
  hasInstallation(props: {
    provider: string;
    installationId: string;
  }): Promise<boolean>;
  /** The owned connection id for each of `installationIds` that Dash has recorded. */
  connectionIdsFor(props: {
    provider: string;
    installationIds: readonly string[];
  }): Promise<ReadonlyMap<string, string>>;
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

  async hasInstallation(props: {
    provider: string;
    installationId: string;
  }): Promise<boolean> {
    const rows = await this.database.orm
      .select({ id: connectionTable.id })
      .from(connectionTable)
      .where(
        and(
          eq(connectionTable.provider, props.provider),
          eq(connectionTable.installationId, props.installationId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async connectionIdsFor(props: {
    provider: string;
    installationIds: readonly string[];
  }): Promise<ReadonlyMap<string, string>> {
    if (props.installationIds.length === 0) {
      return new Map();
    }
    const rows = await this.database.orm
      .select({
        id: connectionTable.id,
        installationId: connectionTable.installationId,
      })
      .from(connectionTable)
      .where(
        and(
          eq(connectionTable.provider, props.provider),
          eq(connectionTable.kind, 'owned'),
          inArray(connectionTable.installationId, [...props.installationIds]),
        ),
      );
    return new Map(
      rows.flatMap(({ id, installationId }) =>
        installationId === null ? [] : [[installationId, id] as const],
      ),
    );
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
