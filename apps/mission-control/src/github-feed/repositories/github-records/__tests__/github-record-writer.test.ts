import { eq } from 'drizzle-orm';
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
import { githubSyncTable } from '#src/github-feed/repositories/github-records/github-records-table.ts';
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
  releaseReads: [],
  truncated: false,
};
let store: GithubRecordsDatabase | undefined;

class Stored {
  static async owned() {
    const [owned] = await GithubRecordsDatabase.required(
      store,
    ).reader.recordsFor({
      connectedBy: adaId,
    });
    return owned;
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
      await GithubRecordsDatabase.required(store).writer.replace({
        ...read,
        syncedAt: fixedNow,
      });
      await GithubRecordsDatabase.required(store).writer.replace({
        ...read,
        syncedAt: later,
      });

      const owned = await Stored.owned();
      expect(owned?.records).toEqual(records);
      expect(owned?.lastSyncedAt).toBe(later.toISOString());
    });

    it('drops a read that started before the one already stored', async () => {
      await GithubRecordsDatabase.required(store).writer.replace({
        ...read,
        syncedAt: later,
      });

      const { applied } = await GithubRecordsDatabase.required(
        store,
      ).writer.replace({
        ...read,
        records: { ...records, issues: [] },
        syncedAt: fixedNow,
      });

      expect(applied).toBe(false);
      expect((await Stored.owned())?.records.issues).toHaveLength(1);
    });

    it('keeps the newer of two concurrent first reads', async () => {
      const [newer] = await Promise.all([
        GithubRecordsDatabase.required(store).writer.replace({
          ...read,
          syncedAt: later,
        }),
        GithubRecordsDatabase.required(store).writer.replace({
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
      await GithubRecordsDatabase.required(store).writer.replace({
        ...read,
        syncedAt: fixedNow,
      });
      await GithubRecordsDatabase.required(store).writer.replace({
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
      await GithubRecordsDatabase.required(store).writer.replace({
        ...read,
        syncedAt: fixedNow,
      });
      await GithubRecordsDatabase.required(store).writer.recordFailure({
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
      await GithubRecordsDatabase.required(store).writer.replace({
        ...read,
        syncedAt: later,
      });
      await GithubRecordsDatabase.required(store).writer.recordFailure({
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

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordWriter attempts',
  () => {
    it('keeps a newer read’s failure when an older read finishes after it', async () => {
      await GithubRecordsDatabase.required(store).writer.recordFailure({
        connectionId: ownedId,
        error: 'GitHub answered 502.',
        attemptedAt: later,
      });
      await GithubRecordsDatabase.required(store).writer.replace({
        ...read,
        syncedAt: fixedNow,
      });

      const [sync] = await GithubRecordsDatabase.required(store)
        .database.orm.select()
        .from(githubSyncTable)
        .where(eq(githubSyncTable.connectionId, ownedId));
      expect(sync).toMatchObject({
        lastSyncedAt: fixedNow,
        lastAttemptedAt: later,
        lastError: 'GitHub answered 502.',
      });
    });
  },
);

const mergedAt = '2026-11-26T09:00:00Z';
const withRecent = ActivityRecords.from({
  activity: {
    ...GithubFeedFixtures.activity(),
    mergedPullRequests: [
      GithubFeedFixtures.mergedPullRequest({ number: 3, mergedAt }),
    ],
    releases: [GithubFeedFixtures.release({ id: 'v1', publishedAt: mergedAt })],
  },
  viewerLogin: 'ada',
});
const withoutRecent = { ...records, pullRequests: [], releases: [] };
const hour = 3_600_000;

class Replaced {
  static async at(props: { when: Date; recordsRead: typeof records }) {
    await GithubRecordsDatabase.required(store).writer.replace({
      ...read,
      records: props.recordsRead,
      syncedAt: props.when,
    });
    return Stored.owned();
  }
}

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordWriter keeps recent merges and releases',
  () => {
    it('stores the merge time and the release', async () => {
      const owned = await Replaced.at({
        when: fixedNow,
        recordsRead: withRecent,
      });

      expect(
        owned?.records.pullRequests.find(({ nodeId }) => nodeId === 'PR_3'),
      ).toMatchObject({
        state: 'merged',
        mergedAt: '2026-11-26T09:00:00.000Z',
      });
      expect(owned?.records.releases).toEqual([
        expect.objectContaining({
          nodeId: 'REL_v1',
          tagName: 'v1',
          publishedAt: '2026-11-26T09:00:00.000Z',
        }),
      ]);
    });

    it('keeps them through a read that no longer reports them', async () => {
      await Replaced.at({ when: fixedNow, recordsRead: withRecent });

      const owned = await Replaced.at({
        when: later,
        recordsRead: withoutRecent,
      });

      expect(owned?.records.pullRequests.map(({ nodeId }) => nodeId)).toEqual([
        'PR_3',
      ]);
      expect(owned?.records.releases).toHaveLength(1);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordWriter ages out recent merges and releases',
  () => {
    it('keeps them up to 48 hours after they happened', async () => {
      await Replaced.at({ when: fixedNow, recordsRead: withRecent });

      const owned = await Replaced.at({
        when: new Date(Date.parse(mergedAt) + 48 * hour),
        recordsRead: withoutRecent,
      });

      expect(owned?.records.pullRequests).toHaveLength(1);
      expect(owned?.records.releases).toHaveLength(1);
    });

    it('ages them out once 48 hours have passed', async () => {
      await Replaced.at({ when: fixedNow, recordsRead: withRecent });

      const owned = await Replaced.at({
        when: new Date(Date.parse(mergedAt) + 48 * hour + 1000),
        recordsRead: withoutRecent,
      });

      expect(owned?.records.pullRequests).toEqual([]);
      expect(owned?.records.releases).toEqual([]);
    });

    it('never keeps an open pull request a read no longer reports', async () => {
      await Replaced.at({ when: fixedNow, recordsRead: records });

      const owned = await Replaced.at({
        when: later,
        recordsRead: withoutRecent,
      });

      expect(owned?.records.pullRequests).toEqual([]);
    });
  },
);
