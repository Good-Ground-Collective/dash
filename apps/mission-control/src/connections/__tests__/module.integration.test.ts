import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';

import {
  adaId,
  ConnectionsHarness,
} from '#src/connections/__tests__/support/connections-harness.ts';
import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { InMemorySyncRequestRepository } from '#src/github-feed/__tests__/support/in-memory-sync-requests.ts';
import { githubFeedEvents } from '#src/github-feed/definitions/feed-events/feed-events.ts';
import { GithubFeedEventHandler } from '#src/github-feed/services/github-feed-event-handler/github-feed-event-handler.ts';
import type {
  GithubReconcile,
  SyncOutcome,
} from '#src/github-feed/services/github-reconcile/github-reconcile.ts';
import { GithubReconcileWorkflows } from '#src/github-feed/services/github-reconcile-workflows/github-reconcile-workflows.ts';
import { RecordedGithubSyncRequests } from '#src/github-feed/services/github-sync-requests/github-sync-requests.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

const databaseUrl = inject('databaseUrl');
const settle = { timeout: 15_000, interval: 100 };

class RecordingReconcile implements GithubReconcile {
  readonly synced: string[] = [];

  async dueConnectionIds(): Promise<string[]> {
    return [];
  }

  async connectionIdsOf(): Promise<string[]> {
    return [];
  }

  async syncConnection(props: { connectionId: string }): Promise<SyncOutcome> {
    this.synced.push(props.connectionId);
    return { status: 'synced' };
  }
}

const harness = new ConnectionsHarness();
const reconcile = new RecordingReconcile();
const syncRequests = new RecordedGithubSyncRequests({
  connections: harness.connections,
  requests: new InMemorySyncRequestRepository(),
});
const reconcileWorkflows = new GithubReconcileWorkflows({
  reconcile,
  syncRequests,
});
for (const { event, actions } of githubFeedEvents) {
  harness.webhookEvents.register(
    new GithubFeedEventHandler({
      event,
      actions,
      syncRequests,
      workflows: reconcileWorkflows,
    }),
  );
}
let runtime: DbosWorkflowRuntime | undefined;
let acmeId = '';

class Deliveries {
  static async send(props: {
    delivery: string;
    event: string;
    action: string;
  }): Promise<{ statusCode: number; body: unknown }> {
    const body = JSON.stringify({
      action: props.action,
      installation: { id: 42 },
    });
    const response = await (
      await harness.start()
    ).inject({
      method: 'POST',
      url: '/integrations/github/webhooks',
      headers: {
        'content-type': 'application/json',
        'x-signature': `signed:${body}`,
        'x-delivery': props.delivery,
        'x-event': props.event,
      },
      payload: body,
    });
    return { statusCode: response.statusCode, body: response.json() };
  }

  static stored(deliveryId: string) {
    return harness.deliveries.deliveries.find(
      (stored) => stored.deliveryId === deliveryId,
    );
  }

  static async processed(deliveryId: string, attempt = 1) {
    return DBOS.listWorkflows({
      workflowIDs: [`webhook-github-${deliveryId}-${attempt}`],
      status: 'SUCCESS',
    });
  }

  static backdate(deliveryId: string): void {
    const stored = Deliveries.stored(deliveryId);
    if (stored !== undefined) {
      stored.receivedAt = new Date(Date.now() - 2 * 60_000);
    }
  }
}

beforeAll(async () => {
  if (databaseUrl === null) {
    return;
  }
  const url = new URL(databaseUrl);
  const server = new pg.Client({ connectionString: url.toString() });
  await server.connect();
  try {
    await server.query(
      'drop database if exists dash_test_webhook_processing with (force)',
    );
  } finally {
    await server.end();
  }
  url.pathname = '/dash_test_webhook_processing';

  harness.module.registerWorkflows();
  reconcileWorkflows.registerWorkflows();
  runtime = new DbosWorkflowRuntime({
    databaseUrl: url.toString(),
    logLevel: 'error',
  });
  await runtime.launch();
  await harness.module.activate();
  await reconcileWorkflows.activate();
  ({ id: acmeId } = await harness.connections.saveOwned({
    provider: 'github',
    connectedBy: adaId,
    installation: acmeInstallation,
  }));
});

afterAll(async () => {
  await harness.stop();
  await runtime?.shutdown();
});

describe.skipIf(databaseUrl === null)('Webhook processing on DBOS', () => {
  it('reads the connection again for a signed pull request delivery', async () => {
    const response = await Deliveries.send({
      delivery: 'pr-1',
      event: 'pull_request',
      action: 'opened',
    });

    expect(response).toEqual({
      statusCode: 202,
      body: { deliveryId: 'pr-1', status: 'recorded' },
    });
    await vi.waitFor(() => {
      expect(reconcile.synced).toContain(acmeId);
    }, settle);
    expect(Deliveries.stored('pr-1')).toMatchObject({
      dispatchPending: false,
    });
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('Webhook events nothing handles', () => {
  it('stores an event type nothing handles without processing it', async () => {
    const before = reconcile.synced.length;

    for (const [delivery, event, action] of [
      ['star-1', 'star', 'created'],
      ['label-1', 'pull_request', 'labeled'],
    ] as const) {
      expect(await Deliveries.send({ delivery, event, action })).toEqual({
        statusCode: 202,
        body: { deliveryId: delivery, status: 'recorded' },
      });
      expect(Deliveries.stored(delivery)).toMatchObject({
        dispatchPending: false,
      });
      expect(
        await DBOS.listWorkflows({
          workflowIDs: [`webhook-github-${delivery}-1`],
        }),
      ).toEqual([]);
    }
    expect(reconcile.synced).toHaveLength(before);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('Webhook redispatch on DBOS', () => {
  it('processes a delivery stored before a crash kept its workflow from starting', async () => {
    const before = reconcile.synced.length;
    await harness.deliveries.record({
      provider: 'github',
      delivery: {
        deliveryId: 'crash-1',
        event: 'issues',
        action: 'assigned',
        installationId: '42',
        installationLifecycle: false,
        installationChange: null,
        payload: {},
      },
      dispatchPending: true,
    });
    Deliveries.backdate('crash-1');

    await DBOS.triggerSchedule('webhook-redispatch-every-minute');

    await vi.waitFor(async () => {
      expect(await Deliveries.processed('crash-1')).toHaveLength(1);
    }, settle);
    expect(Deliveries.stored('crash-1')).toMatchObject({
      dispatchPending: false,
    });
    await vi.waitFor(() => {
      expect(reconcile.synced.length).toBeGreaterThan(before);
    }, settle);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('Webhook retries on DBOS', () => {
  const unsuspend = async (delivery: string) => {
    await harness.connections.setSuspended({
      provider: 'github',
      installationId: '42',
      suspended: true,
    });
    await Deliveries.send({
      delivery,
      event: 'installation',
      action: 'unsuspend',
    });
  };

  it('applies an installation change after the provider fails a read once', async () => {
    const before = reconcile.synced.length;
    harness.flow.unavailableReads = 1;

    await unsuspend('unsuspend-1');

    await vi.waitFor(async () => {
      expect(await Deliveries.processed('unsuspend-1')).toHaveLength(1);
    }, settle);
    expect(
      await harness.connections.listOwned({ provider: 'github' }),
    ).toMatchObject([{ suspended: false }]);
    expect(Deliveries.stored('unsuspend-1')).toMatchObject({
      dispatchPending: false,
    });
    await vi.waitFor(() => {
      expect(reconcile.synced.length).toBeGreaterThan(before);
    }, settle);
  }, 30_000);

  it('starts another attempt at a delivery whose attempt failed', async () => {
    harness.flow.unavailableReads = 4;

    await unsuspend('unsuspend-2');
    await vi.waitFor(async () => {
      expect(
        await DBOS.listWorkflows({
          workflowIDs: ['webhook-github-unsuspend-2-1'],
          status: 'ERROR',
        }),
      ).toHaveLength(1);
    }, settle);
    expect(Deliveries.stored('unsuspend-2')).toMatchObject({
      dispatchPending: true,
    });
    Deliveries.backdate('unsuspend-2');
    await DBOS.triggerSchedule('webhook-redispatch-every-minute');

    await vi.waitFor(async () => {
      expect(await Deliveries.processed('unsuspend-2', 2)).toHaveLength(1);
    }, settle);
    expect(
      await harness.connections.listOwned({ provider: 'github' }),
    ).toMatchObject([{ suspended: false }]);
    expect(Deliveries.stored('unsuspend-2')).toMatchObject({
      dispatchPending: false,
    });
  }, 60_000);
});

describe.skipIf(databaseUrl === null)(
  'Webhook installation changes on DBOS',
  () => {
    it('records a suspension and reads the connection so the feed can say why', async () => {
      const before = reconcile.synced.length;
      harness.flow.suspendedInstallations.add('42');

      await Deliveries.send({
        delivery: 'suspend-1',
        event: 'installation',
        action: 'suspend',
      });

      await vi.waitFor(async () => {
        expect(await Deliveries.processed('suspend-1')).toHaveLength(1);
      }, settle);
      expect(
        await harness.connections.listOwned({ provider: 'github' }),
      ).toMatchObject([{ suspended: true }]);
      await vi.waitFor(() => {
        expect(reconcile.synced.length).toBeGreaterThan(before);
      }, settle);
    }, 30_000);

    it('removes the connection when the app is uninstalled', async () => {
      await Deliveries.send({
        delivery: 'deleted-1',
        event: 'installation',
        action: 'deleted',
      });

      await vi.waitFor(async () => {
        expect(await Deliveries.processed('deleted-1')).toHaveLength(1);
      }, settle);
      expect(
        await harness.connections.listOwned({ provider: 'github' }),
      ).toEqual([]);
    }, 30_000);
  },
);
