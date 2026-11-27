import { DBOS } from '@dbos-inc/dbos-sdk';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';

import { DbosConnectionsFixture } from '#src/connections/__tests__/support/dbos-connections-fixture.ts';

const databaseUrl = inject('databaseUrl');
const settle = { timeout: 15_000, interval: 100 };
const fixture = new DbosConnectionsFixture();
const { harness, reconcile } = fixture;

beforeAll(async () => {
  if (databaseUrl !== null) {
    await fixture.launch({
      databaseUrl,
      database: 'dash_test_webhook_processing',
    });
  }
});

beforeEach(() => {
  harness.flow.unavailableReads = 0;
});

afterAll(async () => {
  await fixture.stop();
});

describe.skipIf(databaseUrl === null)('Webhook processing on DBOS', () => {
  it('reads the connection again for a signed pull request delivery', async () => {
    const { connectionId, installationId } = await fixture.owned();

    const response = await fixture.send({
      installationId,
      delivery: 'pr-1',
      event: 'pull_request',
      action: 'opened',
    });

    expect(response).toEqual({
      statusCode: 202,
      body: { deliveryId: 'pr-1', status: 'recorded' },
    });
    await vi.waitFor(() => {
      expect(reconcile.synced).toContain(connectionId);
    }, settle);
    expect(fixture.stored('pr-1')).toMatchObject({ dispatchPending: false });
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('Webhook events nothing handles', () => {
  it('stores an event type nothing handles without processing it', async () => {
    const { connectionId, installationId } = await fixture.owned();

    for (const [delivery, event, action] of [
      ['star-1', 'star', 'created'],
      ['label-1', 'pull_request', 'labeled'],
    ] as const) {
      expect(
        await fixture.send({ installationId, delivery, event, action }),
      ).toEqual({
        statusCode: 202,
        body: { deliveryId: delivery, status: 'recorded' },
      });
      expect(fixture.stored(delivery)).toMatchObject({
        dispatchPending: false,
      });
      expect(
        await DBOS.listWorkflows({
          workflowIDs: [`webhook-github-${delivery}-1`],
        }),
      ).toEqual([]);
    }
    expect(reconcile.synced).not.toContain(connectionId);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('Webhook redispatch on DBOS', () => {
  it('processes a delivery stored before a crash kept its workflow from starting', async () => {
    const { connectionId, installationId } = await fixture.owned();
    await harness.deliveries.record({
      provider: 'github',
      delivery: {
        deliveryId: 'crash-1',
        event: 'issues',
        action: 'assigned',
        installationId,
        installationLifecycle: false,
        installationChange: null,
        payload: {},
      },
      dispatchPending: true,
    });
    fixture.backdate('crash-1');

    await DBOS.triggerSchedule('webhook-redispatch-every-minute');

    await vi.waitFor(async () => {
      expect(await fixture.processed('crash-1')).toHaveLength(1);
    }, settle);
    expect(fixture.stored('crash-1')).toMatchObject({ dispatchPending: false });
    await vi.waitFor(() => {
      expect(reconcile.synced).toContain(connectionId);
    }, settle);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('Webhook retries on DBOS', () => {
  const unsuspend = async (delivery: string) => {
    const owned = await fixture.owned({ suspended: true });
    await fixture.send({
      installationId: owned.installationId,
      delivery,
      event: 'installation',
      action: 'unsuspend',
    });
    return owned;
  };

  it('applies an installation change after the provider fails a read once', async () => {
    harness.flow.unavailableReads = 1;

    const { connectionId, installationId } = await unsuspend('unsuspend-1');

    await vi.waitFor(async () => {
      expect(await fixture.processed('unsuspend-1')).toHaveLength(1);
    }, settle);
    expect(await fixture.connection(installationId)).toMatchObject({
      suspended: false,
    });
    expect(fixture.stored('unsuspend-1')).toMatchObject({
      dispatchPending: false,
    });
    await vi.waitFor(() => {
      expect(reconcile.synced).toContain(connectionId);
    }, settle);
  }, 30_000);

  it('starts another attempt at a delivery whose attempt failed', async () => {
    harness.flow.unavailableReads = 4;

    const { installationId } = await unsuspend('unsuspend-2');
    await vi.waitFor(async () => {
      expect(
        await DBOS.listWorkflows({
          workflowIDs: ['webhook-github-unsuspend-2-1'],
          status: 'ERROR',
        }),
      ).toHaveLength(1);
    }, settle);
    expect(fixture.stored('unsuspend-2')).toMatchObject({
      dispatchPending: true,
    });
    fixture.backdate('unsuspend-2');
    await DBOS.triggerSchedule('webhook-redispatch-every-minute');

    await vi.waitFor(async () => {
      expect(await fixture.processed('unsuspend-2', 2)).toHaveLength(1);
    }, settle);
    expect(await fixture.connection(installationId)).toMatchObject({
      suspended: false,
    });
    expect(fixture.stored('unsuspend-2')).toMatchObject({
      dispatchPending: false,
    });
  }, 60_000);
});

describe.skipIf(databaseUrl === null)(
  'Webhook installation changes on DBOS',
  () => {
    it('records a suspension and reads the connection so the feed can say why', async () => {
      const { connectionId, installationId } = await fixture.owned();
      harness.flow.suspendedInstallations.add(installationId);

      await fixture.send({
        installationId,
        delivery: 'suspend-1',
        event: 'installation',
        action: 'suspend',
      });

      await vi.waitFor(async () => {
        expect(await fixture.processed('suspend-1')).toHaveLength(1);
      }, settle);
      expect(await fixture.connection(installationId)).toMatchObject({
        suspended: true,
      });
      await vi.waitFor(() => {
        expect(reconcile.synced).toContain(connectionId);
      }, settle);
    }, 30_000);

    it('removes the connection when the app is uninstalled', async () => {
      const { installationId } = await fixture.owned();

      await fixture.send({
        installationId,
        delivery: 'deleted-1',
        event: 'installation',
        action: 'deleted',
      });

      await vi.waitFor(async () => {
        expect(await fixture.processed('deleted-1')).toHaveLength(1);
      }, settle);
      expect(await fixture.connection(installationId)).toBeUndefined();
    }, 30_000);
  },
);
