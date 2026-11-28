import { readFile } from 'node:fs/promises';

import { sql } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { ObjectiveRecordsDatabase } from '#src/objectives/__tests__/support/objective-records-database.ts';
import {
  fixedNow,
  ownedId,
  personalId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { objectiveSyncTable } from '#src/objectives/repositories/objective-records/objective-records-table.ts';

const databaseUrl = inject('databaseUrl');
const migration = new URL(
  '../../../../../drizzle/0014_personal_objectives_cleared.sql',
  import.meta.url,
);
let store: ObjectiveRecordsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await ObjectiveRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_personal_objectives_cleared',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

/** Runs the migration again on rows written after the suite migrated, as production's were. */
class PersonalObjectivesCleared {
  static async apply(database: ObjectiveRecordsDatabase): Promise<void> {
    const statements = (await readFile(migration, 'utf8')).split(
      '--> statement-breakpoint',
    );
    for (const statement of statements) {
      await database.database.orm.execute(sql.raw(statement));
    }
  }
}

describe.skipIf(databaseUrl === null)(
  '0014_personal_objectives_cleared',
  () => {
    it('clears a personal account’s stored error and keeps an organisation’s', async () => {
      const database = ObjectiveRecordsDatabase.required(store);
      await database.addPersonalConnection();
      for (const connectionId of [ownedId, personalId]) {
        await database.writer.recordFailure({
          connectionId,
          error: 'Reading the tracker failed.',
          attemptedAt: fixedNow,
        });
      }

      await PersonalObjectivesCleared.apply(database);

      const remaining = await database.database.orm
        .select({ connectionId: objectiveSyncTable.connectionId })
        .from(objectiveSyncTable);
      expect(remaining).toEqual([{ connectionId: ownedId }]);
    });
  },
);
