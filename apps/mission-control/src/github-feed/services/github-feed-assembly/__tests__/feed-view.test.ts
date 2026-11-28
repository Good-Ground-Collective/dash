import { describe, expect, it } from 'vitest';

import {
  GithubFeedFixtures,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';
import { FeedView } from '#src/github-feed/services/github-feed-assembly/feed-view.ts';
import { WatchedCheckPolicy } from '#src/github-feed/services/watched-checks/watched-check-policy.ts';

class Branches {
  static of(policy: WatchedCheckPolicy) {
    const view = new FeedView({
      policy,
      connection: {
        connectionId: ownedId,
        kind: 'owned',
        accountLogin: 'acme',
        viewerLogin: 'ada',
        lastSyncedAt: '2026-11-26T12:00:00.000Z',
        lastError: null,
        truncated: false,
        records: ActivityRecords.from({
          activity: GithubFeedFixtures.activity(),
          viewerLogin: 'ada',
        }),
      },
    });
    const [branch] = view.defaultBranches();
    return branch;
  }
}

describe('FeedView default branch watching', () => {
  it('watches nothing without rules or exceptions', () => {
    const branch = Branches.of(new WatchedCheckPolicy());

    expect(branch?.watchedState).toBe('none');
    expect(branch?.checks.every(({ watched }) => !watched)).toBe(true);
    expect(branch?.state).toBe('failure');
  });

  it('marks the checks a rule matches and rolls only those up', () => {
    const branch = Branches.of(
      new WatchedCheckPolicy({ rules: ['codecov/*'] }),
    );

    expect(branch?.state).toBe('failure');
    expect(branch?.watchedState).toBe('passing');
    expect(
      branch?.checks.map(({ name, watched, watchSource }) => ({
        name,
        watched,
        watchSource,
      })),
    ).toEqual([
      { name: 'build', watched: false, watchSource: null },
      { name: 'codecov/patch', watched: true, watchSource: 'rule' },
    ]);
  });

  it('is failing once a watched check fails', () => {
    const branch = Branches.of(new WatchedCheckPolicy({ rules: ['build'] }));

    expect(branch?.watchedState).toBe('failing');
  });

  it('lets the repository watch what the rules skip and ignore what they match', () => {
    const branch = Branches.of(
      new WatchedCheckPolicy({
        rules: ['build'],
        overrides: [
          { repository: 'acme/app', checkName: 'build', mode: 'ignore' },
          { repository: 'acme/app', checkName: 'codecov/patch', mode: 'watch' },
        ],
      }),
    );

    expect(branch?.watchedState).toBe('passing');
    expect(branch?.checks.map(({ watchSource }) => watchSource)).toEqual([
      null,
      'repo',
    ]);
  });

  it('keeps another repository’s exceptions out of this one', () => {
    const branch = Branches.of(
      new WatchedCheckPolicy({
        overrides: [
          { repository: 'acme/other', checkName: 'build', mode: 'watch' },
        ],
      }),
    );

    expect(branch?.watchedState).toBe('none');
  });
});
