import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import {
  adaId,
  fixedNow,
  GithubFeedFixtures,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';

const databaseUrl = inject('databaseUrl');
const later = new Date(fixedNow.getTime() + 15 * 60_000);
const records = ActivityRecords.from({
  activity: GithubFeedFixtures.activity(),
  viewerLogin: 'ada',
});
const read = {
  connectionId: ownedId,
  viewerLogin: 'ada',
  records,
  truncated: false,
};
let store: GithubRecordsDatabase | undefined;

class Stored {
  static async owned() {
    const [owned] = await Opened.store().reader.recordsFor({
      connectedBy: adaId,
    });
    return owned;
  }
}

/** The test database, opened once the suite runs. */
class Opened {
  static store(): GithubRecordsDatabase {
    if (store === undefined) {
      throw new TypeError('Set DASH_TEST_DATABASE_URL to run repository tests');
    }
    return store;
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await GithubRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_github_record_writer',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordWriter upserts',
  () => {
    it('writes the same read twice into one set of rows', async () => {
      await Opened.store().writer.replace({ ...read, syncedAt: fixedNow });
      await Opened.store().writer.replace({ ...read, syncedAt: later });

      const owned = await Stored.owned();
      expect(owned?.records).toEqual(records);
      expect(owned?.lastSyncedAt).toBe(later.toISOString());
    });

    it('drops a read that started before the one already stored', async () => {
      await Opened.store().writer.replace({ ...read, syncedAt: later });

      const { applied } = await Opened.store().writer.replace({
        ...read,
        records: { ...records, issues: [] },
        syncedAt: fixedNow,
      });

      expect(applied).toBe(false);
      expect((await Stored.owned())?.records.issues).toHaveLength(1);
    });

    it('keeps the newer of two concurrent first reads', async () => {
      const [newer] = await Promise.all([
        Opened.store().writer.replace({ ...read, syncedAt: later }),
        Opened.store().writer.replace({
          ...read,
          records: { ...records, issues: [] },
          syncedAt: fixedNow,
        }),
      ]);

      const owned = await Stored.owned();
      expect(newer.applied).toBe(true);
      expect(owned?.lastSyncedAt).toBe(later.toISOString());
      expect(owned?.records.issues).toHaveLength(1);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordWriter prunes',
  () => {
    it('removes rows a later read no longer reports', async () => {
      await Opened.store().writer.replace({ ...read, syncedAt: fixedNow });
      await Opened.store().writer.replace({
        ...read,
        records: {
          ...records,
          pullRequests: records.pullRequests.slice(1),
          issues: [],
          assignments: [],
        },
        syncedAt: later,
      });

      const owned = await Stored.owned();
      expect(owned?.records.pullRequests.map(({ nodeId }) => nodeId)).toEqual([
        'PR_2',
      ]);
      expect(owned?.records.issues).toEqual([]);
      expect(owned?.records.assignments).toEqual([]);
      expect(owned?.records.workflowRuns).toHaveLength(1);
    });

    it('keeps the last good rows when a read fails', async () => {
      await Opened.store().writer.replace({ ...read, syncedAt: fixedNow });
      await Opened.store().writer.recordFailure({
        connectionId: ownedId,
        error: 'GitHub answered 502.',
        attemptedAt: later,
      });

      const owned = await Stored.owned();
      expect(owned).toMatchObject({
        lastSyncedAt: fixedNow.toISOString(),
        lastError: 'GitHub answered 502.',
      });
      expect(owned?.records.pullRequests).toHaveLength(2);
    });

    it('drops a failure from a read older than the stored one', async () => {
      await Opened.store().writer.replace({ ...read, syncedAt: later });
      await Opened.store().writer.recordFailure({
        connectionId: ownedId,
        error: 'GitHub answered 502.',
        attemptedAt: fixedNow,
      });

      expect(await Stored.owned()).toMatchObject({
        lastSyncedAt: later.toISOString(),
        lastError: null,
      });
    });
  },
);
