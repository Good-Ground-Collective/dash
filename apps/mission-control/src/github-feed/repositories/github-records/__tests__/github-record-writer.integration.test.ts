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
import type { GithubReleaseRead } from '#src/github-feed/contracts/github-records.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';

const databaseUrl = inject('databaseUrl');
const mergedAt = '2026-11-26T09:00:00Z';
const later = new Date(fixedNow.getTime() + 15 * 60_000);
const merged = ActivityRecords.from({
  activity: {
    ...GithubFeedFixtures.activity(),
    mergedPullRequests: [
      GithubFeedFixtures.mergedPullRequest({ number: 3, mergedAt }),
    ],
    releases: [GithubFeedFixtures.release({ id: 'v1', publishedAt: mergedAt })],
  },
  viewerLogin: 'ada',
});
const withTwoRepositories = {
  ...merged,
  releases: [
    ...merged.releases,
    ...merged.releases.map((release) => ({
      ...release,
      nodeId: 'REL_other',
      repositoryNodeId: 'R_other',
    })),
  ],
};
let store: GithubRecordsDatabase | undefined;

class Stored {
  static async owned() {
    const [owned] = await GithubRecordsDatabase.required(
      store,
    ).reader.recordsFor({ connectedBy: adaId });
    return owned;
  }

  /** Stores a merge and a release in each of two repositories, then a later read that reports no release and saw the releases of `releaseReads`. */
  static async afterRead(releaseReads: GithubReleaseRead[]) {
    const { writer } = GithubRecordsDatabase.required(store);
    const read = {
      connectionId: ownedId,
      viewerLogin: 'ada',
      truncated: false,
    };
    await writer.replace({
      ...read,
      records: withTwoRepositories,
      releaseReads: [],
      syncedAt: fixedNow,
    });
    await writer.replace({
      ...read,
      records: { ...merged, releases: [] },
      releaseReads,
      syncedAt: later,
    });
    return (await Stored.owned())?.records;
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await GithubRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_github_record_writer_releases',
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
  'DrizzleGithubRecordWriter drops releases deleted on GitHub',
  () => {
    it('drops the release a read of its repository, which saw them all, no longer reports', async () => {
      const stored = await Stored.afterRead([
        {
          repositoryNodeId: 'R_app',
          exhaustive: true,
          oldestPublishedAt: null,
        },
      ]);

      expect(stored?.releases.map(({ nodeId }) => nodeId)).toEqual([
        'REL_other',
      ]);
      expect(stored?.pullRequests.map(({ nodeId }) => nodeId)).toContain(
        'PR_3',
      );
    });

    it.each([
      ['at the release’s time', mergedAt, ['REL_other']],
      [
        'after the release’s time',
        '2026-11-26T10:00:00Z',
        ['REL_other', 'REL_v1'],
      ],
    ])(
      'with a partial read whose oldest release was published %s',
      async (_, oldestPublishedAt, expected) => {
        const stored = await Stored.afterRead([
          { repositoryNodeId: 'R_app', exhaustive: false, oldestPublishedAt },
        ]);

        expect(stored?.releases.map(({ nodeId }) => nodeId).toSorted()).toEqual(
          expected,
        );
      },
    );

    it('keeps the releases of repositories the read did not cover', async () => {
      const stored = await Stored.afterRead([]);

      expect(stored?.releases.map(({ nodeId }) => nodeId).toSorted()).toEqual([
        'REL_other',
        'REL_v1',
      ]);
    });
  },
);
