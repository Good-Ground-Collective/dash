import { describe, expect, it } from 'vitest';

import { InMemoryWebhookDeliveryRepository } from '#src/connections/__tests__/support/in-memory-connections.ts';
import { WebhookWorkflowsNotRegisteredError } from '#src/connections/errors.ts';
import { DbosWebhookRetention } from '#src/connections/services/webhook-retention/webhook-retention.ts';

const now = new Date('2026-11-26T04:00:00Z');

class Stored {
  static daysAgo(days: number) {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  static async deliveries(receivedAt: Record<string, Date>) {
    const deliveries = new InMemoryWebhookDeliveryRepository();
    for (const [deliveryId, received] of Object.entries(receivedAt)) {
      await deliveries.record({
        provider: 'github',
        delivery: {
          deliveryId,
          event: 'pull_request',
          action: 'opened',
          installationId: '42',
          installationLifecycle: false,
          installationChange: null,
          payload: {},
        },
        dispatchPending: false,
      });
      const stored = deliveries.deliveries.at(-1);
      if (stored !== undefined) {
        stored.receivedAt = received;
      }
    }
    return deliveries;
  }
}

describe('DbosWebhookRetention', () => {
  it('deletes deliveries received more than seven days before now', async () => {
    const deliveries = await Stored.deliveries({
      old: Stored.daysAgo(8),
      edge: Stored.daysAgo(7),
      recent: Stored.daysAgo(1),
    });
    const retention = new DbosWebhookRetention({ deliveries });

    await expect(retention.prune({ now })).resolves.toBe(1);
    expect(deliveries.deliveries.map(({ deliveryId }) => deliveryId)).toEqual([
      'edge',
      'recent',
    ]);
  });

  it('keeps everything when nothing is older than seven days', async () => {
    const deliveries = await Stored.deliveries({ recent: Stored.daysAgo(6) });

    await expect(
      new DbosWebhookRetention({ deliveries }).prune({ now }),
    ).resolves.toBe(0);
    expect(deliveries.deliveries).toHaveLength(1);
  });

  it('refuses to schedule before its workflow is registered', async () => {
    const deliveries = await Stored.deliveries({});

    await expect(
      new DbosWebhookRetention({ deliveries }).activate(),
    ).rejects.toThrow(WebhookWorkflowsNotRegisteredError);
  });
});
