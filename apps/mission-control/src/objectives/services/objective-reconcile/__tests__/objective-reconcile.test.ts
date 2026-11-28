import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adaId,
  FakeTaskTracker,
  fixedNow,
  ObjectivesFixtures,
  ownedId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { InMemoryObjectiveRecords } from '#src/objectives/__tests__/support/in-memory-objectives.ts';
import { TrackedObjectiveReconcile } from '#src/objectives/services/objective-reconcile/objective-reconcile.ts';

class Reconciling {
  readonly tracker = new FakeTaskTracker();
  readonly records = new InMemoryObjectiveRecords();
  readonly reconcile = new TrackedObjectiveReconcile({
    trackers: [{ provider: 'github', tracker: this.tracker }],
    reader: this.records,
    writer: this.records,
  });

  constructor(target = ObjectivesFixtures.target()) {
    this.records.add(target);
  }

  async sync() {
    return this.reconcile.syncConnection({ connectionId: ownedId });
  }

  stored() {
    return this.records.syncs.get(ownedId);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: fixedNow });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TrackedObjectiveReconcile', () => {
  it('reads the connection’s installation and account and stores what it found', async () => {
    const reconciling = new Reconciling();

    expect(await reconciling.sync()).toEqual({ status: 'synced' });
    expect(reconciling.tracker.queries).toEqual([
      {
        installationId: '42',
        account: { login: 'acme', kind: 'organization' },
      },
    ]);
    expect(reconciling.stored()?.records.initiatives).toHaveLength(4);
  });

  it('keeps the last good rows and records why a later read failed', async () => {
    const reconciling = new Reconciling();
    await reconciling.sync();
    reconciling.tracker.failure = Object.assign(new Error('Bad credentials'), {
      status: 401,
    });

    expect(await reconciling.sync()).toMatchObject({ status: 'failed' });
    expect(reconciling.stored()).toMatchObject({
      lastError: 'The tracker answered 401. Dash tries again at the next sync.',
      lastSyncedAt: fixedNow,
    });
    expect(reconciling.stored()?.records.epics).toHaveLength(3);
  });

  it('records a suspended installation without reading it', async () => {
    const reconciling = new Reconciling(
      ObjectivesFixtures.target({ suspended: true }),
    );

    await reconciling.sync();

    expect(reconciling.tracker.queries).toEqual([]);
    expect(reconciling.stored()?.lastError).toMatch(/suspended/u);
  });

  it('skips a connection no registered tracker reads', async () => {
    const reconciling = new Reconciling(
      ObjectivesFixtures.target({ provider: 'jira' }),
    );

    expect(await reconciling.sync()).toEqual({ status: 'skipped' });
    expect(
      await reconciling.reconcile.connectionIdsOf({ userId: adaId }),
    ).toEqual([]);
  });
});

describe('TrackedObjectiveReconcile reinstated installations', () => {
  it('finds the connection of a reinstated installation only for a provider it reads', async () => {
    const { reconcile } = new Reconciling();

    expect(
      await Promise.all([
        reconcile.connectionIdOf({ provider: 'github', installationId: '42' }),
        reconcile.connectionIdOf({ provider: 'github', installationId: '7' }),
        reconcile.connectionIdOf({ provider: 'jira', installationId: '42' }),
      ]),
    ).toEqual([ownedId, null, null]);
  });
});
