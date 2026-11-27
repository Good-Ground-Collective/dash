import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';

import {
  adaId,
  ConnectionsHarness,
} from '#src/connections/__tests__/support/connections-harness.ts';
import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import type { ConnectListener } from '#src/connections/contracts/connect-listener.ts';
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

/** Reads a reinstated connection again, as the feed does. */
class ReadingListener implements ConnectListener {
  private readonly fixture: DbosConnectionsFixture;

  constructor(fixture: DbosConnectionsFixture) {
    this.fixture = fixture;
  }

  async connected(): Promise<void> {
    await Promise.resolve();
  }

  async reinstated(props: { installationId: string }): Promise<void> {
    const ids = await this.fixture.harness.connections.connectionIdsFor({
      provider: 'github',
      installationIds: [props.installationId],
    });
    const connectionId = ids.get(props.installationId);
    if (connectionId !== undefined) {
      await this.fixture.reconcileWorkflows.syncConnection({ connectionId });
    }
  }
}

/**
 * The connections module on DBOS over a disposable database, with the feed's webhook handlers
 * reading connections through a reconcile that only records them. Each `owned()` call records
 * a connection for a fresh installation, so tests don't share one.
 */
export class DbosConnectionsFixture {
  readonly harness = new ConnectionsHarness({
    listener: new ReadingListener(this),
  });
  readonly reconcile = new RecordingReconcile();
  readonly reconcileWorkflows: GithubReconcileWorkflows;
  private runtime: DbosWorkflowRuntime | undefined;
  private lastInstallationId = 100;

  constructor() {
    const syncRequests = new RecordedGithubSyncRequests({
      connections: this.harness.connections,
      requests: new InMemorySyncRequestRepository(),
    });
    this.reconcileWorkflows = new GithubReconcileWorkflows({
      reconcile: this.reconcile,
      syncRequests,
    });
    for (const { event, actions } of githubFeedEvents) {
      this.harness.webhookEvents.register(
        new GithubFeedEventHandler({
          event,
          actions,
          syncRequests,
          workflows: this.reconcileWorkflows,
        }),
      );
    }
  }

  async launch(props: { databaseUrl: string; database: string }) {
    const url = new URL(props.databaseUrl);
    const server = new pg.Client({ connectionString: url.toString() });
    await server.connect();
    try {
      await server.query(
        `drop database if exists ${props.database} with (force)`,
      );
    } finally {
      await server.end();
    }
    url.pathname = `/${props.database}`;

    this.harness.module.registerWorkflows();
    this.reconcileWorkflows.registerWorkflows();
    this.runtime = new DbosWorkflowRuntime({
      databaseUrl: url.toString(),
      logLevel: 'error',
    });
    await this.runtime.launch();
    await this.harness.module.activate();
    await this.reconcileWorkflows.activate();
  }

  async stop(): Promise<void> {
    await this.harness.stop();
    await this.runtime?.shutdown();
  }

  async owned(props: { suspended?: boolean } = {}) {
    this.lastInstallationId += 1;
    const installationId = String(this.lastInstallationId);
    const { id } = await this.harness.connections.saveOwned({
      provider: 'github',
      connectedBy: adaId,
      installation: {
        ...acmeInstallation,
        externalId: installationId,
        suspended: props.suspended ?? false,
      },
    });
    return { connectionId: id, installationId };
  }

  async connection(installationId: string) {
    return (
      await this.harness.connections.listOwned({ provider: 'github' })
    ).find((connection) => connection.installationId === installationId);
  }

  async send(props: {
    installationId: string;
    delivery: string;
    event: string;
    action: string;
  }): Promise<{ statusCode: number; body: unknown }> {
    const body = JSON.stringify({
      action: props.action,
      installation: { id: Number(props.installationId) },
    });
    const response = await (
      await this.harness.start()
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

  stored(deliveryId: string) {
    return this.harness.deliveries.deliveries.find(
      (stored) => stored.deliveryId === deliveryId,
    );
  }

  async processed(deliveryId: string, attempt = 1) {
    return DBOS.listWorkflows({
      workflowIDs: [`webhook-github-${deliveryId}-${attempt}`],
      status: 'SUCCESS',
    });
  }

  backdate(deliveryId: string): void {
    const stored = this.stored(deliveryId);
    if (stored !== undefined) {
      stored.receivedAt = new Date(Date.now() - 2 * 60_000);
    }
  }
}
