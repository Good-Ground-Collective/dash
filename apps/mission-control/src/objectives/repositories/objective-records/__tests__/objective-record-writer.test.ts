import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { InMemoryObjectiveRecords } from '#src/objectives/__tests__/support/in-memory-objectives.ts';
import { ObjectiveRecordsDatabase } from '#src/objectives/__tests__/support/objective-records-database.ts';
import {
  adaId,
  fixedNow,
  ObjectivesFixtures,
  ownedId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import type { ObjectiveRecords } from '#src/objectives/contracts/objective-records.ts';
import { TrackerRecords } from '#src/objectives/services/tracker-records/tracker-records.ts';

const databaseUrl = inject('databaseUrl');
const later = new Date(fixedNow.getTime() + 15 * 60_000);
const records = TrackerRecords.from(ObjectivesFixtures.snapshot());
let store: ObjectiveRecordsDatabase | undefined;

class Stored {
  static get database(): ObjectiveRecordsDatabase {
    return ObjectiveRecordsDatabase.required(store);
  }

  static async replace(read: ObjectiveRecords, syncedAt: Date) {
    return Stored.database.writer.replace({
      connectionId: ownedId,
      records: read,
      truncated: false,
      syncedAt,
    });
  }

  static async owned() {
    const [owned] = await Stored.database.reader.recordsFor({
      connectedBy: adaId,
    });
    return owned;
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await ObjectiveRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_objective_record_writer',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleObjectiveRecordWriter', () => {
  it('writes the same read twice into one set of rows and reads it back', async () => {
    await Stored.replace(records, fixedNow);
    await Stored.replace(records, later);

    const owned = await Stored.owned();
    expect(owned?.records).toEqual({
      ...records,
      initiatives: records.initiatives.toSorted((left, right) =>
        left.nodeId.localeCompare(right.nodeId),
      ),
      placements: expect.arrayContaining(records.placements),
      activity: expect.arrayContaining(records.activity),
    });
    expect(owned?.lastSyncedAt).toBe(later.toISOString());
  });

  it('prunes what a later read no longer reports', async () => {
    await Stored.replace(records, fixedNow);
    await Stored.replace(
      {
        ...records,
        epics: records.epics.filter(({ nodeId }) => nodeId !== 'E1'),
        placements: records.placements.filter(
          ({ epicNodeId }) => epicNodeId !== 'E1',
        ),
        tickets: records.tickets.filter(
          ({ epicNodeId }) => epicNodeId !== 'E1',
        ),
        activity: [],
      },
      later,
    );

    const owned = await Stored.owned();
    expect(owned?.records.epics.map(({ nodeId }) => nodeId)).toEqual([
      'E2',
      'E3',
    ]);
    expect(owned?.records.tickets.map(({ nodeId }) => nodeId)).toEqual(['T4']);
    expect(owned?.records.activity).toEqual([]);
  });
});

describe.skipIf(databaseUrl === null)(
  'DrizzleObjectiveRecordWriter ordering',
  () => {
    it('drops a read that started before the one already stored', async () => {
      await Stored.replace(records, later);

      expect(
        await Stored.replace(InMemoryObjectiveRecords.empty(), fixedNow),
      ).toEqual({ applied: false });
      expect((await Stored.owned())?.records.epics).toHaveLength(3);
    });

    it('keeps the last good rows when a later read fails, and says why', async () => {
      await Stored.replace(records, fixedNow);
      await Stored.database.writer.recordFailure({
        connectionId: ownedId,
        error: 'Reading the tracker failed.',
        attemptedAt: later,
      });

      const owned = await Stored.owned();
      expect(owned).toMatchObject({
        lastError: 'Reading the tracker failed.',
        lastSyncedAt: fixedNow.toISOString(),
      });
      expect(owned?.records.initiatives).toHaveLength(4);
    });

    it('never prunes a person’s overlay, so parking survives a re-sync', async () => {
      await Stored.replace(records, fixedNow);
      await Stored.database.overlays.save({
        userId: adaId,
        id: 'PVT_launch',
        changes: { parked: true },
      });

      await Stored.replace(InMemoryObjectiveRecords.empty(), later);
      await Stored.replace(records, new Date(later.getTime() + 60_000));

      expect(
        (await Stored.database.overlays.listFor({ userId: adaId })).get(
          'PVT_launch',
        ),
      ).toMatchObject({ parked: true });
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleObjectiveRecordWriter attempts',
  () => {
    it('drops a failure from a read older than the stored one', async () => {
      await Stored.replace(records, later);
      await Stored.database.writer.recordFailure({
        connectionId: ownedId,
        error: 'Reading the tracker failed.',
        attemptedAt: fixedNow,
      });

      expect(await Stored.owned()).toMatchObject({
        lastError: null,
        lastSyncedAt: later.toISOString(),
      });
    });

    it('keeps a newer read’s failure when an older read finishes after it', async () => {
      await Stored.database.writer.recordFailure({
        connectionId: ownedId,
        error: 'Reading the tracker failed.',
        attemptedAt: later,
      });
      await Stored.replace(records, fixedNow);

      expect(await Stored.owned()).toMatchObject({
        lastError: 'Reading the tracker failed.',
        lastSyncedAt: fixedNow.toISOString(),
      });
    });
  },
);
