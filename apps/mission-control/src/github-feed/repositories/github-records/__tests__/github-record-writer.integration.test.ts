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

class Checks {
  static async write(props: {
    checks: typeof merged.checks;
    at: Date;
  }): Promise<typeof merged.checks> {
    await GithubRecordsDatabase.required(store).writer.replace({
      connectionId: ownedId,
      viewerLogin: 'ada',
      truncated: false,
      releaseReads: [],
      records: { ...merged, checks: props.checks },
      syncedAt: props.at,
    });
    return (await Stored.owned())?.records.checks ?? [];
  }

  static withLint(state: 'failure' | 'success') {
    return merged.checks.map((check) =>
      check.name === 'lint' ? { ...check, state } : check,
    );
  }

  static lintOf(checks: typeof merged.checks) {
    return checks.find(({ name }) => name === 'lint');
  }
}

describe.skipIf(databaseUrl === null)(
  'DrizzleGithubRecordWriter failing_since',
  () => {
    const third = new Date(later.getTime() + 15 * 60_000);
    const fourth = new Date(third.getTime() + 15 * 60_000);

    it('keeps when a check first failed while it keeps failing, clears it on a pass, and starts fresh on a new failure', async () => {
      const first = await Checks.write({
        checks: Checks.withLint('failure'),
        at: fixedNow,
      });
      const again = await Checks.write({
        checks: Checks.withLint('failure'),
        at: later,
      });
      const passing = await Checks.write({
        checks: Checks.withLint('success'),
        at: third,
      });
      const failedAgain = await Checks.write({
        checks: Checks.withLint('failure'),
        at: fourth,
      });

      expect(Checks.lintOf(first)?.failingSince).toBe(fixedNow.toISOString());
      expect(Checks.lintOf(again)?.failingSince).toBe(fixedNow.toISOString());
      expect(Checks.lintOf(passing)?.failingSince).toBeNull();
      expect(Checks.lintOf(failedAgain)?.failingSince).toBe(
        fourth.toISOString(),
      );
    });

    it('never sets it on a check that is not failing', async () => {
      const stored = await Checks.write({
        checks: merged.checks,
        at: fixedNow,
      });

      expect(
        stored.find(({ name }) => name === 'codecov/patch')?.failingSince,
      ).toBeNull();
    });

    it('replaces a check that moved to a newer head and prunes one the read no longer reports', async () => {
      await Checks.write({ checks: merged.checks, at: fixedNow });

      const stored = await Checks.write({
        checks: merged.checks
          .filter(({ name }) => name !== 'codecov/patch')
          .map((check) => ({ ...check, headSha: 'newer-head' })),
        at: later,
      });

      expect(stored.map(({ name }) => name).toSorted()).toEqual([
        'build',
        'lint',
      ]);
      expect(stored.every(({ headSha }) => headSha === 'newer-head')).toBe(
        true,
      );
    });
  },
);
