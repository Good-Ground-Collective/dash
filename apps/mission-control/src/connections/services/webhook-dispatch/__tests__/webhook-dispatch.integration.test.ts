import { DBOS } from '@dbos-inc/dbos-sdk';
import {
  afterAll,
  afterEach,
  beforeAll,
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
const releaseTopic = 'release';

const failedAttempt = DBOS.registerWorkflow(
  async () => {
    await Promise.reject(new Error('attempt failed'));
  },
  { name: 'webhookDispatchFailedAttempt' },
);
const heldAttempt = DBOS.registerWorkflow(
  async () => {
    await DBOS.recv<string>(releaseTopic, 30);
  },
  { name: 'webhookDispatchHeldAttempt' },
);

class PendingDelivery {
  static async store(deliveryId: string): Promise<void> {
    const { installationId } = await fixture.owned();
    await fixture.harness.deliveries.record({
      provider: 'github',
      delivery: {
        deliveryId,
        event: 'issues',
        action: 'assigned',
        installationId,
        installationLifecycle: false,
        installationChange: null,
        payload: {},
      },
      dispatchPending: true,
    });
    fixture.backdate(deliveryId);
  }

  static async attempts(deliveryId: string, attempt: number) {
    return DBOS.listWorkflows({
      workflowIDs: [`webhook-github-${deliveryId}-${attempt}`],
    });
  }

  static async redispatch(): Promise<void> {
    const handle = await DBOS.triggerSchedule(
      'webhook-redispatch-every-minute',
    );
    await handle.getResult();
  }
}

beforeAll(async () => {
  if (databaseUrl !== null) {
    await fixture.launch({
      databaseUrl,
      database: 'dash_test_webhook_dispatch',
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await fixture.stop();
});

describe.skipIf(databaseUrl === null)(
  'Webhook redispatch limits on DBOS',
  () => {
    it('gives up on a delivery once ten attempts have failed', async () => {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const handle = await DBOS.startWorkflow(failedAttempt, {
          workflowID: `webhook-github-abandoned-1-${attempt}`,
        })();
        await expect(handle.getResult()).rejects.toThrow('attempt failed');
      }
      await PendingDelivery.store('abandoned-1');
      const logger = DBOS.logger;
      vi.spyOn(DBOS, 'logger', 'get').mockReturnValue(logger);
      const warn = vi.spyOn(logger, 'warn').mockReturnValue();

      await PendingDelivery.redispatch();

      expect(fixture.stored('abandoned-1')).toMatchObject({
        dispatchPending: false,
      });
      expect(await PendingDelivery.attempts('abandoned-1', 11)).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        'Giving up on webhook delivery abandoned-1 after 10 failed attempts',
      );
    }, 30_000);

    it('leaves alone a delivery whose attempt is still running', async () => {
      const held = await DBOS.startWorkflow(heldAttempt, {
        workflowID: 'webhook-github-held-1-1',
      })();
      await PendingDelivery.store('held-1');

      await PendingDelivery.redispatch();

      expect(await PendingDelivery.attempts('held-1', 2)).toEqual([]);
      expect(fixture.stored('held-1')).toMatchObject({ dispatchPending: true });
      await DBOS.send(held.workflowID, 'done', releaseTopic);
      await vi.waitFor(async () => {
        expect(await held.getStatus()).toMatchObject({ status: 'SUCCESS' });
      }, settle);
    }, 30_000);
  },
);
