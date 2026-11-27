import type { WebhookDelivery } from '@dash/integrations-core';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { webhookDeliveryTable } from '#src/connections/repositories/webhook-deliveries/webhook-deliveries-table.ts';
import { DrizzleWebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import { GithubRecordsDatabase } from '#src/github-feed/__tests__/support/github-records-database.ts';

const databaseUrl = inject('databaseUrl');
const now = new Date('2026-11-26T12:00:00Z');
let store: GithubRecordsDatabase | undefined;

const opened: WebhookDelivery = {
  deliveryId: 'd-1',
  event: 'pull_request',
  action: 'opened',
  installationId: '42',
  installationLifecycle: false,
  installationChange: null,
  payload: { action: 'opened', number: 7 },
};

class Deliveries {
  static minutesAgo(minutes: number) {
    return new Date(now.getTime() - minutes * 60_000);
  }

  static repository() {
    return new DrizzleWebhookDeliveryRepository({
      database: GithubRecordsDatabase.required(store).database,
    });
  }

  static async receivedAt(deliveryId: string, receivedAt: Date) {
    await GithubRecordsDatabase.required(store)
      .database.orm.update(webhookDeliveryTable)
      .set({ receivedAt })
      .where(eq(webhookDeliveryTable.deliveryId, deliveryId));
  }

  static async stored() {
    return GithubRecordsDatabase.required(store)
      .database.orm.select()
      .from(webhookDeliveryTable)
      .orderBy(webhookDeliveryTable.deliveryId);
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await GithubRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_webhook_deliveries',
    });
  }
});

beforeEach(async () => {
  await store?.database.orm.delete(webhookDeliveryTable);
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)(
  'DrizzleWebhookDeliveryRepository',
  () => {
    it('stores the payload once, however often the delivery arrives', async () => {
      const deliveries = Deliveries.repository();

      await expect(
        deliveries.record({
          provider: 'github',
          delivery: opened,
          dispatchPending: true,
        }),
      ).resolves.toEqual({ duplicate: false });
      await expect(
        deliveries.record({
          provider: 'github',
          delivery: opened,
          dispatchPending: true,
        }),
      ).resolves.toEqual({ duplicate: true });

      expect(await Deliveries.stored()).toMatchObject([
        {
          deliveryId: 'd-1',
          action: 'opened',
          payload: { action: 'opened', number: 7 },
          dispatchPending: true,
        },
      ]);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleWebhookDeliveryRepository dispatch',
  () => {
    it('lists deliveries whose processing never started, once they are old enough', async () => {
      const deliveries = Deliveries.repository();
      for (const deliveryId of ['d-1', 'd-2', 'd-3']) {
        await deliveries.record({
          provider: 'github',
          delivery: { ...opened, deliveryId },
          dispatchPending: deliveryId !== 'd-3',
        });
        await Deliveries.receivedAt(deliveryId, Deliveries.minutesAgo(5));
      }
      await deliveries.markDispatched({
        provider: 'github',
        deliveryId: 'd-2',
      });

      await expect(
        deliveries.pendingDispatch({
          receivedBefore: Deliveries.minutesAgo(1),
          limit: 10,
        }),
      ).resolves.toEqual([
        {
          provider: 'github',
          deliveryId: 'd-1',
          event: 'pull_request',
          action: 'opened',
          installationId: '42',
          installationChange: null,
        },
      ]);
      await expect(
        deliveries.pendingDispatch({
          receivedBefore: Deliveries.minutesAgo(10),
          limit: 10,
        }),
      ).resolves.toEqual([]);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleWebhookDeliveryRepository retention',
  () => {
    it('deletes only deliveries received before the cutoff', async () => {
      const deliveries = Deliveries.repository();
      await deliveries.record({
        provider: 'github',
        delivery: opened,
        dispatchPending: false,
      });
      await deliveries.record({
        provider: 'github',
        delivery: { ...opened, deliveryId: 'd-2' },
        dispatchPending: false,
      });
      await Deliveries.receivedAt('d-1', Deliveries.minutesAgo(8 * 24 * 60));
      await Deliveries.receivedAt('d-2', Deliveries.minutesAgo(6 * 24 * 60));

      await expect(
        deliveries.deleteReceivedBefore({
          cutoff: Deliveries.minutesAgo(7 * 24 * 60),
        }),
      ).resolves.toBe(1);
      expect(await Deliveries.stored()).toMatchObject([{ deliveryId: 'd-2' }]);
    });
  },
);
