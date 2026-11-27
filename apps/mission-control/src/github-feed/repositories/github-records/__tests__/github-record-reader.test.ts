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
  guestId,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';
import type { GithubFeed } from '#src/github-feed/contracts/github-feed.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';
import { GithubFeedAssembly } from '#src/github-feed/services/github-feed-assembly/github-feed-assembly.ts';

const databaseUrl = inject('databaseUrl');
const records = ActivityRecords.from({
  activity: GithubFeedFixtures.activity(),
  viewerLogin: 'ada',
});
let store: GithubRecordsDatabase | undefined;

class Feeds {
  /** The feed's items with their connection blanked, to compare what each kind of connection produced. */
  static items(feed: GithubFeed | undefined) {
    const item = <T extends { connectionId: string }>(value: T) => ({
      ...value,
      connectionId: 'any',
    });
    return {
      reviewRequests: feed?.reviewRequests.map(item),
      myPullRequests: feed?.myPullRequests.map(item),
      failedRuns: feed?.failedRuns.map(item),
      assignedIssues: feed?.assignedIssues.map(item),
    };
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
      await Opened.store().writer.replace({
        connectionId,
        viewerLogin: 'ada',
        records,
        syncedAt: fixedNow,
      });
    }

    const connections = await Opened.store().reader.recordsFor({
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
    expect(Feeds.items(guest)).toEqual(Feeds.items(owned));
    expect(Feeds.items(owned).reviewRequests).toHaveLength(1);
  });
});

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordReader sync targets',
  () => {
    it('lists sync targets with their unarchived repositories, untried first', async () => {
      await Opened.store().writer.recordFailure({
        connectionId: ownedId,
        error: 'GitHub answered 502.',
        attemptedAt: fixedNow,
      });

      const targets = await Opened.store().reader.syncTargets({ limit: 10 });

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
        await Opened.store().reader.syncTargets({
          connectionId: guestId,
          limit: 10,
        }),
      ).toEqual([
        expect.objectContaining({ connectionId: guestId, kind: 'guest' }),
      ]);
      expect(
        await Opened.store().reader.syncTargets({
          connectedBy: ownedId,
          limit: 10,
        }),
      ).toEqual([]);
    });
  },
);
