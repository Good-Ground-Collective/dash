import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { DrizzleBriefingRepository } from '#src/briefing/repositories/briefings/briefing-repository.ts';
import { briefingTable } from '#src/briefing/repositories/briefings/briefings-table.ts';
import { DrizzlePersonTimeZoneReader } from '#src/briefing/repositories/people-time-zones/person-time-zone-reader.ts';
import { DrizzleOwnerTimeZoneReader } from '#src/briefing/repositories/owner-time-zones/owner-time-zone-reader.ts';
import {
  adaId,
  graceId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';

/**
 * A migrated database of its own on the test Postgres, so test files running side by side
 * never reset each other's rows. It holds Ada and Grace, reset before each test.
 */
export class BriefingsDatabase {
  readonly database: PostgresDatabase;
  readonly briefings: DrizzleBriefingRepository;
  readonly ownerTimeZone: DrizzleOwnerTimeZoneReader;
  readonly people: DrizzlePersonTimeZoneReader;

  private constructor(props: { url: string }) {
    this.database = new PostgresDatabase({
      url: props.url,
      queryTimeoutMilliseconds: 0,
    });
    this.briefings = new DrizzleBriefingRepository({
      database: this.database,
    });
    this.ownerTimeZone = new DrizzleOwnerTimeZoneReader({
      database: this.database,
    });
    this.people = new DrizzlePersonTimeZoneReader({ database: this.database });
  }

  async reset(): Promise<void> {
    const orm = this.database.orm;
    await orm.delete(briefingTable);
    await orm.delete(userTable);
    await orm.insert(userTable).values([
      {
        id: adaId,
        name: 'Ada',
        email: 'ada@example.com',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: graceId,
        name: 'Grace',
        email: 'grace@example.com',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  /** The test database once the suite has opened it. */
  static required(store: BriefingsDatabase | undefined): BriefingsDatabase {
    if (store === undefined) {
      throw new TypeError('Set DASH_TEST_DATABASE_URL to run repository tests');
    }
    return store;
  }

  /** Creates `name` on the server at `serverUrl` when it is missing, and migrates it. */
  static async open(props: {
    serverUrl: string;
    name: string;
  }): Promise<BriefingsDatabase> {
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
    const opened = new BriefingsDatabase({ url: url.toString() });
    await opened.database.migrate({
      migrationsFolder: fileURLToPath(
        new URL('../../../../drizzle', import.meta.url),
      ),
    });
    return opened;
  }
}
