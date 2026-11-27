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
