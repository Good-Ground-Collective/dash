import { fileURLToPath } from 'node:url';

import { eq, inArray } from 'drizzle-orm';
import pg from 'pg';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { connectionTable } from '#src/connections/repositories/connections/connections-table.ts';
import {
  adaId,
  graceId,
  ownedId,
  personalId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { DrizzleObjectiveOverlayRepository } from '#src/objectives/repositories/objective-overlays/objective-overlay-repository.ts';
import { DrizzleObjectiveRecordReader } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import { DrizzleObjectiveRecordWriter } from '#src/objectives/repositories/objective-records/objective-record-writer.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';

/**
 * A migrated database of its own on the test Postgres, so test files running side by side
 * never reset each other's rows. It holds Ada, Grace and Ada's owned acme connection, reset
 * before each test.
 */
export class ObjectiveRecordsDatabase {
  readonly database: PostgresDatabase;
  readonly reader: DrizzleObjectiveRecordReader;
  readonly writer: DrizzleObjectiveRecordWriter;
  readonly overlays: DrizzleObjectiveOverlayRepository;

  private constructor(props: { url: string }) {
    this.database = new PostgresDatabase({
      url: props.url,
      queryTimeoutMilliseconds: 0,
    });
    this.reader = new DrizzleObjectiveRecordReader({ database: this.database });
    this.writer = new DrizzleObjectiveRecordWriter({ database: this.database });
    this.overlays = new DrizzleObjectiveOverlayRepository({
      database: this.database,
    });
  }

  async reset(): Promise<void> {
    const orm = this.database.orm;
    await orm
      .delete(connectionTable)
      .where(eq(connectionTable.provider, 'github'));
    await orm.delete(userTable).where(inArray(userTable.id, [adaId, graceId]));
    await orm.insert(userTable).values([
      { id: adaId, name: 'Ada', email: 'ada@example.com' },
      { id: graceId, name: 'Grace', email: 'grace@example.com' },
    ]);
    await orm.insert(connectionTable).values({
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
    });
  }

  /** Installs the app on Ada's personal account, which Dash never reads objectives from. */
  async addPersonalConnection(): Promise<void> {
    await this.database.orm.insert(connectionTable).values({
      id: personalId,
      provider: 'github',
      kind: 'owned',
      installationId: '43',
      accountExternalId: '9920',
      accountLogin: 'ada',
      accountKind: 'user',
      accountUrl: 'https://github.com/ada',
      settingsUrl: 'https://github.com/settings/installations/43',
      repositorySelection: 'all',
      connectedBy: adaId,
    });
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  /** The test database once the suite has opened it. */
  static required(
    store: ObjectiveRecordsDatabase | undefined,
  ): ObjectiveRecordsDatabase {
    if (store === undefined) {
      throw new TypeError('Set DASH_TEST_DATABASE_URL to run repository tests');
    }
    return store;
  }

  /** Creates `name` on the server at `serverUrl` when it is missing, and migrates it. */
  static async open(props: {
    serverUrl: string;
    name: string;
  }): Promise<ObjectiveRecordsDatabase> {
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
    const opened = new ObjectiveRecordsDatabase({ url: url.toString() });
    await opened.database.migrate({
      migrationsFolder: fileURLToPath(
        new URL('../../../../drizzle', import.meta.url),
      ),
    });
    return opened;
  }
}
