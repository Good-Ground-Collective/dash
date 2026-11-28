import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { expect, vi } from 'vitest';

import { HeldReconcile } from '#src/github-feed/__tests__/support/held-reconcile.ts';
import { InMemorySyncRequestRepository } from '#src/github-feed/__tests__/support/in-memory-sync-requests.ts';
import { GithubReconcileWorkflows } from '#src/github-feed/services/github-reconcile-workflows/github-reconcile-workflows.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

export const previousDeploy = 'previous-deploy';
export const settle = { timeout: 15_000, interval: 100 };

/**
 * The reconcile workflows running on DBOS in a database of their own, with helpers to leave
 * work behind the way an earlier deploy would. Every test ends with `clear`, so no read stays
 * held and no workflow stays queued for a later test, or for the live schedules, to trip on.
 */
export class StaleDeployHarness {
  readonly reconcile: HeldReconcile;
  readonly workflows: GithubReconcileWorkflows;
  private readonly runtime: DbosWorkflowRuntime;
  private readonly databaseUrl: string;
  private readonly seeded: string[] = [];

  private constructor(props: {
    reconcile: HeldReconcile;
    workflows: GithubReconcileWorkflows;
    runtime: DbosWorkflowRuntime;
    databaseUrl: string;
  }) {
    this.reconcile = props.reconcile;
    this.workflows = props.workflows;
    this.runtime = props.runtime;
    this.databaseUrl = props.databaseUrl;
  }

  async close(): Promise<void> {
    this.reconcile.release();
    await this.runtime.shutdown();
  }

  /** Releases every held read and cancels everything this test left queued or running. */
  async clear(): Promise<void> {
    this.reconcile.release();
    const queued = await DBOS.listWorkflows({
      queueName: 'github-reconcile',
      status: ['ENQUEUED', 'DELAYED', 'PENDING'],
    });
    const ids = [
      ...this.seeded.splice(0),
      ...queued.map(({ workflowID }) => workflowID),
    ];
    for (const id of ids) {
      await DBOS.cancelWorkflow(id);
    }
    this.reconcile.release();
  }

  async seedHolder(props: {
    connectionId: string;
    deduplicationID: string;
    appVersion?: string;
  }): Promise<string> {
    const handle = await DBOS.enqueueWorkflowWithOptions(
      {
        queueName: 'github-reconcile',
        workflowName: 'githubReconcileConnection',
        deduplicationID: props.deduplicationID,
        delaySeconds: 3600,
        appVersion: props.appVersion ?? DBOS.applicationVersion,
      },
      props.connectionId,
    );
    this.seeded.push(handle.workflowID);
    return handle.workflowID;
  }

  /** Makes a seeded workflow look created at `createdAt` and started at `startedAt`, as a running read would. */
  async markPending(props: {
    workflowId: string;
    createdAt?: number;
    startedAt?: number;
  }): Promise<void> {
    await this.sql(
      "update dbos.workflow_status set status = 'PENDING', created_at = $1, started_at_epoch_ms = $2 where workflow_uuid = $3",
      [
        props.createdAt ?? Date.now(),
        props.startedAt ?? Date.now(),
        props.workflowId,
      ],
    );
  }

  async sql(statement: string, values: unknown[]): Promise<void> {
    const client = new pg.Client({ connectionString: this.databaseUrl });
    await client.connect();
    try {
      await client.query(statement, values);
    } finally {
      await client.end();
    }
  }

  async runScheduled(): Promise<void> {
    const before = (await this.finished('githubReconcileScheduled')).length;
    await DBOS.enqueueWorkflowWithOptions({
      queueName: 'github-reconcile',
      workflowName: 'githubReconcileScheduled',
    });
    await vi.waitFor(async () => {
      expect(await this.finished('githubReconcileScheduled')).toHaveLength(
        before + 1,
      );
    }, settle);
  }

  /** The reads the reconcile recorded for a connection, in the order they ran. */
  readsOf(connectionId: string): string[] {
    return this.reconcile.synced.filter((synced) => synced === connectionId);
  }

  /** The read workflow of a connection, whatever its status. */
  async readWorkflowOf(connectionId: string) {
    const reads = await DBOS.listWorkflows({
      workflowName: 'githubReconcileConnection',
      loadInput: true,
    });
    return reads.find(
      ({ input }) => Array.isArray(input) && input[0] === connectionId,
    );
  }

  private async finished(workflowName: string) {
    return DBOS.listWorkflows({ workflowName, status: 'SUCCESS' });
  }

  static minutesAgo(minutes: number): number {
    return Date.now() - minutes * 60_000;
  }

  /** The harness once the suite has opened it. */
  static required(harness: StaleDeployHarness | undefined): StaleDeployHarness {
    if (harness === undefined) {
      throw new TypeError('Set DASH_TEST_DATABASE_URL to run workflow tests');
    }
    return harness;
  }

  /** Launches DBOS on a fresh database `name` on the server at `serverUrl`. */
  static async open(props: {
    serverUrl: string;
    name: string;
    readTimeoutMs?: number;
  }): Promise<StaleDeployHarness> {
    const url = new URL(props.serverUrl);
    const server = new pg.Client({ connectionString: url.toString() });
    await server.connect();
    try {
      await server.query(`drop database if exists ${props.name} with (force)`);
    } finally {
      await server.end();
    }
    url.pathname = `/${props.name}`;

    const reconcile = new HeldReconcile();
    const workflowProps: ConstructorParameters<
      typeof GithubReconcileWorkflows
    >[0] = { reconcile, syncRequests: new InMemorySyncRequestRepository() };
    if (props.readTimeoutMs !== undefined) {
      workflowProps.readTimeoutMs = props.readTimeoutMs;
    }
    const workflows = new GithubReconcileWorkflows(workflowProps);
    workflows.registerWorkflows();
    const runtime = new DbosWorkflowRuntime({
      databaseUrl: url.toString(),
      logLevel: 'error',
    });
    await runtime.launch();
    await workflows.activate();
    return new StaleDeployHarness({
      reconcile,
      workflows,
      runtime,
      databaseUrl: url.toString(),
    });
  }
}
