import type { Installation } from '@dash/integrations-core';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { OwnedConnection } from '#src/connections/contracts/connections.ts';
import { ConnectionNotStoredError } from '#src/connections/errors.ts';
import { ConnectionRows } from '#src/connections/repositories/connections/connection-rows.ts';
import { connectionTable } from '#src/connections/repositories/connections/connections-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

export interface ConnectionRepository {
  /** Creates or refreshes the connection for `installation`, replacing its repositories. */
  saveOwned(props: {
    provider: string;
    connectedBy: string;
    installation: Installation;
  }): Promise<OwnedConnection>;
  listOwned(props: { provider: string }): Promise<OwnedConnection[]>;
  /** Whether Dash can read the provider through any connection, owned or guest. A suspended installation doesn't count. */
  exists(props: { provider: string }): Promise<boolean>;
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
  /** Updates the recorded connection from a fresh read of its installation. False when none is recorded. */
  refreshOwned(props: {
    provider: string;
    installation: Installation;
  }): Promise<boolean>;
  setSuspended(props: {
    provider: string;
    installationId: string;
    suspended: boolean;
  }): Promise<void>;
  /** Moves a connection still recorded as suspended to the back of `listSuspended`. */
  touchSuspended(props: {
    provider: string;
    installationId: string;
  }): Promise<void>;
  /** Suspended owned connections of `providers`, least recently updated first. */
  listSuspended(props: {
    providers: readonly string[];
    limit: number;
  }): Promise<{ provider: string; installationId: string }[]>;
  /** Deletes the connection for an installation that was uninstalled, and with it everything read through it. */
  removeInstallation(props: {
    provider: string;
    installationId: string;
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

      const repositories = await ConnectionRows.replaceRepositories({
        transaction,
        connectionId: row.id,
        repositories: installation.repositories,
      });
      return ConnectionRows.owned({ row, repositories });
    });
  }

  async refreshOwned(props: {
    provider: string;
    installation: Installation;
  }): Promise<boolean> {
    const { installation } = props;
    return this.database.orm.transaction(async (transaction) => {
      const [row] = await transaction
        .update(connectionTable)
        .set({
          accountLogin: installation.account.login,
          accountUrl: installation.account.url,
          settingsUrl: installation.url,
          repositorySelection: installation.repositorySelection,
          suspended: installation.suspended,
          updatedAt: new Date(),
        })
        .where(
          this.installationIs({
            provider: props.provider,
            installationId: installation.externalId,
          }),
        )
        .returning({ id: connectionTable.id });
      if (row === undefined) {
        return false;
      }
      await ConnectionRows.replaceRepositories({
        transaction,
        connectionId: row.id,
        repositories: installation.repositories,
      });
      return true;
    });
  }

  async setSuspended(props: {
    provider: string;
    installationId: string;
    suspended: boolean;
  }): Promise<void> {
    await this.database.orm
      .update(connectionTable)
      .set({ suspended: props.suspended, updatedAt: new Date() })
      .where(this.installationIs(props));
  }

  async touchSuspended(props: {
    provider: string;
    installationId: string;
  }): Promise<void> {
    await this.database.orm
      .update(connectionTable)
      .set({ updatedAt: new Date() })
      .where(
        and(this.installationIs(props), eq(connectionTable.suspended, true)),
      );
  }

  async listSuspended(props: {
    providers: readonly string[];
    limit: number;
  }): Promise<{ provider: string; installationId: string }[]> {
    if (props.providers.length === 0) {
      return [];
    }
    const rows = await this.database.orm
      .select({
        provider: connectionTable.provider,
        installationId: connectionTable.installationId,
      })
      .from(connectionTable)
      .where(
        and(
          inArray(connectionTable.provider, [...props.providers]),
          eq(connectionTable.kind, 'owned'),
          eq(connectionTable.suspended, true),
        ),
      )
      .orderBy(asc(connectionTable.updatedAt))
      .limit(props.limit);
    return rows.flatMap(({ provider, installationId }) =>
      installationId === null ? [] : [{ provider, installationId }],
    );
  }

  async removeInstallation(props: {
    provider: string;
    installationId: string;
  }): Promise<void> {
    await this.database.orm
      .delete(connectionTable)
      .where(this.installationIs(props));
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
    const repositories = await ConnectionRows.repositoriesOf({
      orm: this.database.orm,
      connectionIds: rows.map((row) => row.id),
    });
    return rows.map((row) =>
      ConnectionRows.owned({
        row,
        repositories: repositories.filter(
          (repository) => repository.connectionId === row.id,
        ),
      }),
    );
  }

  async exists(props: { provider: string }): Promise<boolean> {
    const rows = await this.database.orm
      .select({ id: connectionTable.id })
      .from(connectionTable)
      .where(
        and(
          eq(connectionTable.provider, props.provider),
          eq(connectionTable.suspended, false),
        ),
      )
      .limit(1);
    return rows.length > 0;
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

  private installationIs(props: { provider: string; installationId: string }) {
    return and(
      eq(connectionTable.provider, props.provider),
      eq(connectionTable.kind, 'owned'),
      eq(connectionTable.installationId, props.installationId),
    );
  }
}
