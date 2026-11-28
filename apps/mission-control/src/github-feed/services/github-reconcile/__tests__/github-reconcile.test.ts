import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaId,
  fixedNow,
  GithubFeedFixtures,
  graceId,
  guestId,
  ownedId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubFeedHarness } from '#src/github-feed/__tests__/support/github-feed-harness.ts';

const unclaimedId = '40000000-0000-4000-8000-000000000001';
const uninstalledId = '40000000-0000-4000-8000-000000000002';

class Reconciling {
  static async linked(): Promise<GithubFeedHarness> {
    const harness = await new GithubFeedHarness().link({
      userId: adaId,
      login: 'ada',
    });
    harness.records.add(GithubFeedFixtures.target());
    return harness;
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: fixedNow });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GithubReconcile syncConnection', () => {
  it('stores what the source read and when', async () => {
    const harness = await Reconciling.linked();

    const outcome = await harness.module.reconcile.syncConnection({
      connectionId: ownedId,
    });

    const sync = harness.records.syncs.get(ownedId);
    expect(outcome).toEqual({ status: 'synced' });
    expect(sync).toMatchObject({
      viewerLogin: 'ada',
      lastSyncedAt: fixedNow,
      lastError: null,
    });
    expect(sync?.records?.pullRequests).toHaveLength(2);
  });

  it('drops what GitHub no longer reports on the next read', async () => {
    const harness = await Reconciling.linked();
    await harness.module.reconcile.syncConnection({ connectionId: ownedId });
    harness.feed.activity = {
      ...GithubFeedFixtures.activity(),
      reviewRequests: [],
      assignedIssues: [],
    };
    vi.setSystemTime(new Date(fixedNow.getTime() + 15 * 60_000));

    await harness.module.reconcile.syncConnection({ connectionId: ownedId });

    const records = harness.records.syncs.get(ownedId)?.records;
    expect(records?.pullRequests.map(({ nodeId }) => nodeId)).toEqual(['PR_2']);
    expect(records?.issues).toEqual([]);
    expect(records?.assignments).toEqual([]);
  });
});

describe('GithubReconcile failed reads', () => {
  it('records a failed read and keeps the rows the last good one stored', async () => {
    const harness = await Reconciling.linked();
    await harness.module.reconcile.syncConnection({ connectionId: ownedId });
    harness.feed.failure = Object.assign(new Error('Bad credentials token=x'), {
      status: 401,
    });

    const outcome = await harness.module.reconcile.syncConnection({
      connectionId: ownedId,
    });

    const sync = harness.records.syncs.get(ownedId);
    expect(outcome).toEqual({
      status: 'failed',
      error: 'Error [status 401]: Bad credentials [redacted]',
    });
    expect(sync?.lastError).toBe(
      'GitHub answered 401. Dash tries again at the next sync.',
    );
    expect(sync?.lastSyncedAt).toEqual(fixedNow);
    expect(sync?.records?.pullRequests).toHaveLength(2);
  });

  it('records why a suspended installation or an unlinked person can’t be read', async () => {
    const harness = new GithubFeedHarness();
    harness.records.add(GithubFeedFixtures.target()).add(
      GithubFeedFixtures.target({
        connectionId: guestId,
        connectedBy: graceId,
        suspended: true,
      }),
    );
    for (const target of [
      { connectionId: unclaimedId, connectedBy: null },
      { connectionId: uninstalledId, installationId: null },
    ]) {
      harness.records.add(GithubFeedFixtures.target(target));
    }

    for (const connectionId of [ownedId, guestId, unclaimedId, uninstalledId]) {
      await harness.module.reconcile.syncConnection({ connectionId });
    }

    expect(harness.records.syncs.get(ownedId)?.lastError).toMatch(
      /Authorize the GitHub app/u,
    );
    expect(harness.records.syncs.get(guestId)?.lastError).toMatch(/suspended/u);
    for (const connectionId of [unclaimedId, uninstalledId]) {
      expect(harness.records.syncs.get(connectionId)?.lastError).toBe(
        'This connection can’t be read until it is reconnected.',
      );
    }
    expect(harness.feed.queries).toEqual([]);
  });
});

describe('GithubReconcile overlapping reads', () => {
  it('keeps a newer read’s failure when an older read finishes after it', async () => {
    const harness = await Reconciling.linked();
    const later = new Date(fixedNow.getTime() + 15 * 60_000);
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    harness.feed.held = held;
    const older = harness.module.reconcile.syncConnection({
      connectionId: ownedId,
    });
    while (harness.feed.queries.length === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    harness.feed.held = null;
    harness.feed.failure = Object.assign(new Error('Bad gateway'), {
      status: 502,
    });
    vi.setSystemTime(later);

    const newer = await harness.module.reconcile.syncConnection({
      connectionId: ownedId,
    });
    release();

    expect(newer).toMatchObject({ status: 'failed' });
    expect(await older).toEqual({ status: 'synced' });
    expect(harness.records.syncs.get(ownedId)).toMatchObject({
      lastSyncedAt: fixedNow,
      lastAttemptedAt: later,
      lastError: 'GitHub answered 502. Dash tries again at the next sync.',
    });
  });
});

describe('GithubReconcile choosing connections', () => {
  it('skips kinds no source reads yet', async () => {
    const harness = await Reconciling.linked();
    harness.records.add(
      GithubFeedFixtures.target({ connectionId: guestId, kind: 'guest' }),
    );

    expect(
      await harness.module.reconcile.syncConnection({ connectionId: guestId }),
    ).toEqual({ status: 'skipped' });
    expect(await harness.module.reconcile.dueConnectionIds()).toEqual([
      ownedId,
    ]);
  });

  it('reaches an owned connection behind more guest connections than a run reads', async () => {
    const harness = await Reconciling.linked();
    for (let index = 0; index < 60; index += 1) {
      harness.records.add(
        GithubFeedFixtures.target({
          connectionId: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          kind: 'guest',
        }),
      );
    }

    expect(await harness.module.reconcile.dueConnectionIds()).toEqual([
      ownedId,
    ]);
  });

  it('lists only the connections a person made', async () => {
    const harness = await Reconciling.linked();
    harness.records.add(
      GithubFeedFixtures.target({
        connectionId: guestId,
        connectedBy: graceId,
      }),
    );

    expect(
      await harness.module.reconcile.connectionIdsOf({ userId: adaId }),
    ).toEqual([ownedId]);
  });

  it('reads at most fifty connections a run, least recently tried first', async () => {
    const harness = await Reconciling.linked();
    for (let index = 0; index < 60; index += 1) {
      harness.records.add(
        GithubFeedFixtures.target({
          connectionId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        }),
      );
    }
    await harness.module.reconcile.syncConnection({ connectionId: ownedId });

    const due = await harness.module.reconcile.dueConnectionIds();

    expect(due).toHaveLength(50);
    expect(due).not.toContain(ownedId);
  });
});

describe('GithubReconcile staleConnections', () => {
  it('lists a connection last read more than three schedule intervals ago and no other', async () => {
    const harness = await Reconciling.linked();
    harness.records.add(
      GithubFeedFixtures.target({
        connectionId: unclaimedId,
        connectedBy: adaId,
      }),
    );
    await harness.module.reconcile.syncConnection({ connectionId: ownedId });
    vi.setSystemTime(new Date(fixedNow.getTime() + 44 * 60_000));
    await harness.module.reconcile.syncConnection({
      connectionId: unclaimedId,
    });
    expect(await harness.module.reconcile.staleConnections()).toEqual([]);

    vi.setSystemTime(new Date(fixedNow.getTime() + 46 * 60_000));

    expect(await harness.module.reconcile.staleConnections()).toEqual([
      { connectionId: ownedId, lastSyncedAt: fixedNow },
    ]);
  });

  it('does not list a connection that has never been read', async () => {
    const harness = await Reconciling.linked();
    vi.setSystemTime(new Date(fixedNow.getTime() + 24 * 60 * 60_000));

    expect(await harness.module.reconcile.staleConnections()).toEqual([]);
  });
});
