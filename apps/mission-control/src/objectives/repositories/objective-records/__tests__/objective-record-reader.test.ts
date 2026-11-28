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
  adaId,
  fixedNow,
  graceId,
  ownedId,
  personalId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';

const databaseUrl = inject('databaseUrl');
let store: ObjectiveRecordsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await ObjectiveRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_objective_record_reader',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleObjectiveRecordReader', () => {
  it('finds owned connections of the providers asked for', async () => {
    const reader = ObjectiveRecordsDatabase.required(store).reader;

    expect(
      await reader.syncTargets({ providers: ['github'], limit: 10 }),
    ).toEqual([
      {
        connectionId: ownedId,
        provider: 'github',
        installationId: '42',
        account: { login: 'acme', kind: 'organization' },
        connectedBy: adaId,
        suspended: false,
      },
    ]);
    expect(
      await reader.syncTargets({ providers: ['jira'], limit: 10 }),
    ).toEqual([]);
    expect(
      await reader.syncTargets({
        providers: ['github'],
        connectedBy: graceId,
        limit: 10,
      }),
    ).toEqual([]);
  });

  it('lists a connection’s objectives only once it has been read', async () => {
    const { reader, writer } = ObjectiveRecordsDatabase.required(store);
    expect(await reader.recordsFor({ connectedBy: adaId })).toEqual([]);

    await writer.recordFailure({
      connectionId: ownedId,
      error: 'Reading the tracker failed.',
      attemptedAt: fixedNow,
    });

    expect(await reader.recordsFor({ connectedBy: adaId })).toEqual([
      expect.objectContaining({
        connectionId: ownedId,
        lastSyncedAt: null,
        lastError: 'Reading the tracker failed.',
      }),
    ]);
  });
});

describe.skipIf(databaseUrl === null)(
  'DrizzleObjectiveRecordReader personal accounts',
  () => {
    it('never offers a personal account to read', async () => {
      const database = ObjectiveRecordsDatabase.required(store);
      await database.addPersonalConnection();

      const targets = await database.reader.syncTargets({
        providers: ['github'],
        limit: 10,
      });
      const asked = await database.reader.syncTargets({
        providers: ['github'],
        connectionId: personalId,
        limit: 10,
      });

      expect(targets.map(({ connectionId }) => connectionId)).toEqual([
        ownedId,
      ]);
      expect(asked).toEqual([]);
    });

    it('lists no objectives for a personal account, even with an error stored', async () => {
      const database = ObjectiveRecordsDatabase.required(store);
      const { reader, writer } = database;
      await database.addPersonalConnection();
      await writer.recordFailure({
        connectionId: personalId,
        error: 'Dash reads initiatives from an organisation’s tracker.',
        attemptedAt: fixedNow,
      });

      expect(await reader.recordsFor({ connectedBy: adaId })).toEqual([]);
    });
  },
);
