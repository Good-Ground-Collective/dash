import { describe, expect, it } from 'vitest';

import {
  GithubFeedFixtures,
  guestId,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import type { ConnectionRecords } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import { ActivityRecords } from '#src/github-feed/services/activity-records/activity-records.ts';
import { GithubFeedAssembly } from '#src/github-feed/services/github-feed-assembly/github-feed-assembly.ts';

class Connections {
  static read(overrides: Partial<ConnectionRecords> = {}): ConnectionRecords {
    return {
      connectionId: ownedId,
      kind: 'owned',
      accountLogin: 'acme',
      viewerLogin: 'ada',
      lastSyncedAt: '2026-11-26T12:00:00.000Z',
      lastError: null,
      records: ActivityRecords.from({
        activity: GithubFeedFixtures.activity(),
        viewerLogin: 'ada',
      }),
      ...overrides,
    };
  }
}

describe('GithubFeedAssembly', () => {
  it('matches the viewer’s login without regard to case', () => {
    const feed = GithubFeedAssembly.assemble([
      Connections.read({ viewerLogin: 'ADA' }),
    ]);

    expect(feed.myPullRequests.map(({ id }) => id)).toEqual(['PR_2']);
    expect(feed.reviewRequests.map(({ id }) => id)).toEqual(['PR_1']);
    expect(feed.assignedIssues[0]?.assignees).toEqual(['ada', 'grace']);
  });

  it('shows no personal groups for a connection never read for anyone', () => {
    const feed = GithubFeedAssembly.assemble([
      Connections.read({ viewerLogin: null }),
    ]);

    expect(feed.reviewRequests).toEqual([]);
    expect(feed.myPullRequests).toEqual([]);
    expect(feed.assignedIssues).toEqual([]);
  });

  it('lists an item two connections both see once, newest first', () => {
    const feed = GithubFeedAssembly.assemble([
      Connections.read(),
      Connections.read({ connectionId: guestId, kind: 'guest' }),
    ]);

    expect(feed.connections.map(({ kind }) => kind)).toEqual([
      'owned',
      'guest',
    ]);
    expect(feed.myPullRequests).toHaveLength(1);
    expect(feed.myPullRequests[0]?.connectionId).toBe(ownedId);
  });

  it('leaves out a check rollup stored for an older head', () => {
    const read = Connections.read();
    const [rollup] = read.records.checkRollups;
    const stale = Connections.read({
      records: {
        ...read.records,
        checkRollups:
          rollup === undefined ? [] : [{ ...rollup, headSha: 'old' }],
      },
    });

    const feed = GithubFeedAssembly.assemble([stale]);

    expect(feed.reviewRequests[0]?.checks).toBeNull();
  });
});
