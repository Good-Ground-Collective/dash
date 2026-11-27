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
  ObjectivesFixtures,
  ownedId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { DrizzleStoredInitiatives } from '#src/objectives/repositories/objective-records/stored-initiatives.ts';
import { TrackerRecords } from '#src/objectives/services/tracker-records/tracker-records.ts';

const databaseUrl = inject('databaseUrl');
let store: ObjectiveRecordsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await ObjectiveRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_stored_initiatives',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleStoredInitiatives', () => {
  it('finds none before a read stores one, then finds it', async () => {
    const database = ObjectiveRecordsDatabase.required(store);
    const presence = new DrizzleStoredInitiatives({
      database: database.database,
    });
    expect(await presence.anyInitiative()).toBe(false);

    await database.writer.replace({
      connectionId: ownedId,
      records: TrackerRecords.from(ObjectivesFixtures.snapshot()),
      truncated: false,
      syncedAt: fixedNow,
    });

    expect(await presence.anyInitiative()).toBe(true);
  });
});
