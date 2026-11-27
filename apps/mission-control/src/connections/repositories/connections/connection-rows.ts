import type { OwnedConnection } from '#src/connections/contracts/connections.ts';
import type {
  connectionRepositoryTable,
  connectionTable,
} from '#src/connections/repositories/connections/connections-table.ts';

type ConnectionRow = typeof connectionTable.$inferSelect;
type RepositoryRow = typeof connectionRepositoryTable.$inferSelect;

/** Stored connection rows read back as connections. */
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
}
