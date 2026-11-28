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

import { connectionTable } from '#src/connections/repositories/connections/connections-table.ts';
import {
  adaId,
  fixedNow,
  GithubFeedFixtures,
  guestId,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';
import { GithubFeedAssembly } from '#src/github-feed/services/github-feed-assembly/github-feed-assembly.ts';

const databaseUrl = inject('databaseUrl');
const records = ActivityRecords.from({
  activity: GithubFeedFixtures.activity(),
  viewerLogin: 'ada',
});
let store: GithubRecordsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await GithubRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_github_record_reader',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleGithubRecordReader', () => {
  it('reads owned and guest rows back as the same feed', async () => {
    for (const connectionId of [ownedId, guestId]) {
      await GithubRecordsDatabase.required(store).writer.replace({
        connectionId,
        viewerLogin: 'ada',
        records,
        releaseReads: [],
        truncated: false,
        syncedAt: fixedNow,
      });
    }

    const connections = await GithubRecordsDatabase.required(
      store,
    ).reader.recordsFor({
      connectedBy: adaId,
    });
    const [owned, guest] = (['owned', 'guest'] as const).map((kind) =>
      GithubFeedAssembly.assemble(
        connections.filter((connection) => connection.kind === kind),
      ),
    );

    expect(connections.map(({ kind }) => kind).toSorted()).toEqual([
      'guest',
      'owned',
    ]);
    expect(guest?.myPullRequests[0]?.connectionId).toBe(guestId);
    expect(GithubFeedFixtures.comparable(guest)).toEqual(
      GithubFeedFixtures.comparable(owned),
    );
    expect(GithubFeedFixtures.comparable(owned).reviewRequests).toHaveLength(1);
  });
});

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordReader sync targets',
  () => {
    it('lists sync targets with their unarchived repositories, untried first', async () => {
      await GithubRecordsDatabase.required(store).writer.recordFailure({
        connectionId: ownedId,
        error: 'GitHub answered 502.',
        attemptedAt: fixedNow,
      });

      const targets = await GithubRecordsDatabase.required(
        store,
      ).reader.syncTargets({
        kinds: ['owned', 'guest'],
        limit: 10,
      });

      expect(targets.map(({ connectionId }) => connectionId)).toEqual([
        guestId,
        ownedId,
      ]);
      expect(targets[1]).toMatchObject({
        kind: 'owned',
        installationId: '42',
        account: { login: 'acme', kind: 'organization' },
        connectedBy: adaId,
        repositories: ['acme/app'],
      });
    });

    it('narrows sync targets to one person or one connection', async () => {
      expect(
        await GithubRecordsDatabase.required(store).reader.syncTargets({
          connectionId: guestId,
          kinds: ['owned', 'guest'],
          limit: 10,
        }),
      ).toEqual([
        expect.objectContaining({ connectionId: guestId, kind: 'guest' }),
      ]);
      expect(
        await GithubRecordsDatabase.required(store).reader.syncTargets({
          connectedBy: ownedId,
          kinds: ['owned', 'guest'],
          limit: 10,
        }),
      ).toEqual([]);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordReader stale syncs',
  () => {
    const longAgo = new Date(fixedNow.getTime() - 60 * 60_000);
    const before = new Date(fixedNow.getTime() - 45 * 60_000);

    async function readLongAgo(connectionId: string, syncedAt: Date) {
      await GithubRecordsDatabase.required(store).writer.replace({
        connectionId,
        viewerLogin: 'ada',
        records,
        truncated: false,
        syncedAt,
      });
    }

    it('lists a stale unsuspended connection and leaves a suspended one out', async () => {
      await readLongAgo(ownedId, longAgo);
      await readLongAgo(guestId, longAgo);
      await GithubRecordsDatabase.required(store)
        .database.orm.update(connectionTable)
        .set({ suspended: true })
        .where(eq(connectionTable.id, guestId));

      const stale = await GithubRecordsDatabase.required(
        store,
      ).reader.staleSyncs({ before, kinds: ['owned', 'guest'], limit: 10 });

      expect(stale).toEqual([{ connectionId: ownedId, lastSyncedAt: longAgo }]);
    });

    it('lists the stalest connections up to the limit', async () => {
      await readLongAgo(ownedId, longAgo);
      await readLongAgo(guestId, new Date(longAgo.getTime() - 60_000));

      const stale = await GithubRecordsDatabase.required(
        store,
      ).reader.staleSyncs({ before, kinds: ['owned', 'guest'], limit: 1 });

      expect(stale.map(({ connectionId }) => connectionId)).toEqual([guestId]);
    });
  },
);
