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
      truncated: false,
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

const failingSince = '2026-11-24T08:00:00.000Z';

class CheckedConnections {
  static read(overrides: Partial<ConnectionRecords> = {}): ConnectionRecords {
    const connection = Connections.read(overrides);
    return {
      ...connection,
      records: {
        ...connection.records,
        checks: connection.records.checks.map((check) =>
          check.state === 'failure'
            ? { ...check, failingSince: failingSince }
            : check,
        ),
      },
    };
  }
}

describe('GithubFeedAssembly default branches', () => {
  it('shows each default branch with its head and state, failing checks first, with when they began failing', () => {
    const feed = GithubFeedAssembly.assemble([CheckedConnections.read()]);

    expect(feed.defaultBranches).toEqual([
      {
        repository: {
          fullName: 'acme/app',
          url: 'https://github.com/acme/app',
        },
        branch: 'main',
        headSha: 'main-head',
        state: 'failure',
        checks: [
          expect.objectContaining({
            name: 'build',
            state: 'failure',
            failingSince,
          }),
          expect.objectContaining({
            name: 'codecov/patch',
            state: 'success',
            failingSince: null,
          }),
        ],
      },
    ]);
  });

  it('shows a repository once when two connections read it', () => {
    const feed = GithubFeedAssembly.assemble([
      CheckedConnections.read(),
      CheckedConnections.read({ connectionId: guestId, kind: 'guest' }),
    ]);

    expect(feed.defaultBranches).toHaveLength(1);
  });
});

describe('GithubFeedAssembly default branch heads', () => {
  it('leaves the state null for a head whose checks could not be read, and drops checks of an older head', () => {
    const connection = CheckedConnections.read();
    const stale = {
      ...connection,
      records: {
        ...connection.records,
        repositories: connection.records.repositories.map((repository) => ({
          ...repository,
          defaultBranchState: null,
          defaultBranchHeadSha: 'newer-head',
        })),
      },
    };

    const feed = GithubFeedAssembly.assemble([stale]);

    expect(feed.defaultBranches).toEqual([
      expect.objectContaining({
        headSha: 'newer-head',
        state: null,
        checks: [],
      }),
    ]);
  });

  it('shows no default branch for a repository whose head was never read', () => {
    const connection = CheckedConnections.read();
    const unread = {
      ...connection,
      records: {
        ...connection.records,
        repositories: connection.records.repositories.map((repository) => ({
          ...repository,
          defaultBranchHeadSha: null,
        })),
      },
    };

    expect(GithubFeedAssembly.assemble([unread]).defaultBranches).toEqual([]);
  });
});

describe('GithubFeedAssembly pull request checks', () => {
  it('names the failing checks on each of the viewer’s pull requests, and counts every check', () => {
    const connection = CheckedConnections.read();
    const counted = {
      ...connection,
      records: {
        ...connection.records,
        checkRollups: [
          {
            pullRequestNodeId: 'PR_2',
            headSha: 'sha2',
            state: 'failure' as const,
            successCount: 3,
            failureCount: 1,
            pendingCount: 1,
          },
        ],
      },
    };

    const feed = GithubFeedAssembly.assemble([counted]);

    expect(feed.myPullRequests).toEqual([
      expect.objectContaining({
        id: 'PR_2',
        failingChecks: [
          { name: 'lint', url: 'https://github.com/acme/app/runs/2' },
        ],
        checkCount: 5,
      }),
    ]);
    expect(feed.reviewRequests[0]).not.toHaveProperty('failingChecks');
  });

  it('counts none for a pull request whose checks were never read', () => {
    const feed = GithubFeedAssembly.assemble([CheckedConnections.read()]);

    expect(feed.myPullRequests[0]).toMatchObject({ checkCount: 0 });
  });
});
