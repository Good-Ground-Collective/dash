import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import pg from 'pg';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import {
  connectionRepositoryTable,
  connectionTable,
} from '#src/connections/repositories/connections/connections-table.ts';
import {
  adaId,
  guestId,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { DrizzleGithubRecordReader } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import { DrizzleGithubRecordWriter } from '#src/github-feed/repositories/github-records/github-record-writer.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';

/**
 * A migrated database of its own on the test Postgres, so test files running side by side
 * never reset each other's rows. It holds Ada, her owned acme connection and a guest
 * connection, reset before each test.
 */
export class GithubRecordsDatabase {
  readonly database: PostgresDatabase;
  readonly reader: DrizzleGithubRecordReader;
  readonly writer: DrizzleGithubRecordWriter;

  private constructor(props: { url: string }) {
    this.database = new PostgresDatabase({
      url: props.url,
      queryTimeoutMilliseconds: 0,
    });
    this.reader = new DrizzleGithubRecordReader({ database: this.database });
    this.writer = new DrizzleGithubRecordWriter({ database: this.database });
  }

  async reset(): Promise<void> {
    const orm = this.database.orm;
    await orm
      .delete(connectionTable)
      .where(eq(connectionTable.provider, 'github'));
    await orm.delete(userTable).where(eq(userTable.id, adaId));
    await orm
      .insert(userTable)
      .values({ id: adaId, name: 'Ada', email: 'ada@example.com' });
    await orm.insert(connectionTable).values([
      {
        id: ownedId,
        provider: 'github',
        kind: 'owned',
        installationId: '42',
        accountExternalId: '9919',
        accountLogin: 'acme',
        accountKind: 'organization',
        accountUrl: 'https://github.com/acme',
        settingsUrl:
          'https://github.com/organizations/acme/settings/installations/42',
        repositorySelection: 'selected',
        connectedBy: adaId,
      },
      {
        id: guestId,
        provider: 'github',
        kind: 'guest',
        accountExternalId: '583231',
        accountLogin: 'ada',
        accountKind: 'user',
        accountUrl: 'https://github.com/ada',
        connectedBy: adaId,
      },
    ]);
    await orm.insert(connectionRepositoryTable).values([
      {
        connectionId: ownedId,
        externalId: '1',
        fullName: 'acme/app',
        url: 'https://github.com/acme/app',
        defaultBranch: 'main',
        archived: false,
      },
      {
        connectionId: ownedId,
        externalId: '2',
        fullName: 'acme/old',
        url: 'https://github.com/acme/old',
        defaultBranch: 'main',
        archived: true,
      },
    ]);
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  /** The test database once the suite has opened it. */
  static required(
    store: GithubRecordsDatabase | undefined,
  ): GithubRecordsDatabase {
    if (store === undefined) {
      throw new TypeError('Set DASH_TEST_DATABASE_URL to run repository tests');
    }
    return store;
  }

  /** Creates `name` on the server at `serverUrl` when it is missing, and migrates it. */
  static async open(props: {
    serverUrl: string;
    name: string;
  }): Promise<GithubRecordsDatabase> {
    const server = new pg.Client({ connectionString: props.serverUrl });
    await server.connect();
    try {
      const existing = await server.query(
        'select 1 from pg_database where datname = $1',
        [props.name],
      );
      if (existing.rowCount === 0) {
        await server.query(`create database "${props.name}"`);
      }
    } finally {
      await server.end();
    }

    const url = new URL(props.serverUrl);
    url.pathname = `/${props.name}`;
    const opened = new GithubRecordsDatabase({ url: url.toString() });
    await opened.database.migrate({
      migrationsFolder: fileURLToPath(
        new URL('../../../../drizzle', import.meta.url),
      ),
    });
    return opened;
  }
}
