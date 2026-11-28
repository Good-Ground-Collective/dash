import { describe, expect, it } from 'vitest';

import {
  fixedNow,
  GithubFeedFixtures,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { InMemoryGithubRecords } from '#src/github-feed/__tests__/support/in-memory-github-records.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';

const records = ActivityRecords.from({
  activity: GithubFeedFixtures.activity(),
  viewerLogin: 'ada',
});

class Reads {
  static at(index: number): Date {
    return new Date(fixedNow.getTime() + index * 15 * 60_000);
  }

  /** The `failing_since` of check `lint` after each of the reads, one per given state. */
  static async lintAcross(states: ('failure' | 'pending' | 'success')[]) {
    const store = new InMemoryGithubRecords();
    const failingSince: (string | null | undefined)[] = [];
    for (const [index, state] of states.entries()) {
      await store.replace({
        connectionId: 'c1',
        viewerLogin: 'ada',
        truncated: false,
        releaseReads: [],
        records: {
          ...records,
          checks: records.checks.map((check) =>
            check.name === 'lint' ? { ...check, state } : check,
          ),
        },
        syncedAt: Reads.at(index),
      });
      failingSince.push(
        store.syncs
          .get('c1')
          ?.records?.checks.find(({ name }) => name === 'lint')?.failingSince,
      );
    }
    return failingSince;
  }
}

describe('InMemoryGithubRecords failing_since', () => {
  it('keeps it across consecutive failures and clears it on a pass', async () => {
    expect(await Reads.lintAcross(['failure', 'failure', 'success'])).toEqual([
      Reads.at(0).toISOString(),
      Reads.at(0).toISOString(),
      null,
    ]);
  });

  it('starts afresh when a check fails again after a pending read', async () => {
    expect(await Reads.lintAcross(['failure', 'pending', 'failure'])).toEqual([
      Reads.at(0).toISOString(),
      null,
      Reads.at(2).toISOString(),
    ]);
  });
});
