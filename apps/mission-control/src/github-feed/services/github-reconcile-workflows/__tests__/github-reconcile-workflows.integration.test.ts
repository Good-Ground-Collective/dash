import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';

import { HeldReconcile } from '#src/github-feed/__tests__/support/held-reconcile.ts';
import { InMemorySyncRequestRepository } from '#src/github-feed/__tests__/support/in-memory-sync-requests.ts';
import { GithubReconcileWorkflows } from '#src/github-feed/services/github-reconcile-workflows/github-reconcile-workflows.ts';
import { DbosStrandedWorkflowRecovery } from '#src/platform/services/workflows/stranded-workflow-recovery.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

const databaseUrl = inject('databaseUrl');
const settle = { timeout: 15_000, interval: 100 };
const previousDeploy = 'previous-deploy';
const reconcile = new HeldReconcile();
const workflows = new GithubReconcileWorkflows({
  reconcile,
  syncRequests: new InMemorySyncRequestRepository(),
});
let runtime: DbosWorkflowRuntime | undefined;
let testDatabaseUrl = '';

class Deploys {
  static async finished(workflowName: string) {
    return DBOS.listWorkflows({ workflowName, status: 'SUCCESS' });
  }

  static async seedHolder(props: {
    connectionId: string;
    deduplicationID: string;
    appVersion?: string;
  }) {
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
    return handle.workflowID;
  }

  static async runScheduled() {
    const before = (await Deploys.finished('githubReconcileScheduled')).length;
    await DBOS.enqueueWorkflowWithOptions({
      queueName: 'github-reconcile',
      workflowName: 'githubReconcileScheduled',
    });
    await vi.waitFor(async () => {
      expect(await Deploys.finished('githubReconcileScheduled')).toHaveLength(
        before + 1,
      );
    }, settle);
  }

  static async sql(statement: string, values: unknown[]) {
    const client = new pg.Client({ connectionString: testDatabaseUrl });
    await client.connect();
    try {
      await client.query(statement, values);
    } finally {
      await client.end();
    }
  }

  static of(connectionId: string) {
    return reconcile.synced.filter((synced) => synced === connectionId);
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
      'drop database if exists dash_test_github_reconcile_deploys with (force)',
    );
  } finally {
    await server.end();
  }
  url.pathname = '/dash_test_github_reconcile_deploys';
  testDatabaseUrl = url.toString();
  workflows.registerWorkflows();
  runtime = new DbosWorkflowRuntime({
    databaseUrl: url.toString(),
    logLevel: 'error',
  });
  await runtime.launch();
  await workflows.activate();
});

afterAll(async () => {
  reconcile.release();
  await runtime?.shutdown();
});

describe.skipIf(databaseUrl === null)(
  'GithubReconcileWorkflows across deploys',
  () => {
    it('reads a connection whose earlier read was left queued by a previous deploy', async () => {
      const id = 'left-behind-1';
      const leftBehind = await Deploys.seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${id}`,
        appVersion: previousDeploy,
      });
      reconcile.due = [id];

      await Deploys.runScheduled();

      await vi.waitFor(() => {
        expect(Deploys.of(id)).toHaveLength(1);
      }, settle);
      reconcile.release();
      reconcile.due = ['acme'];
      await DBOS.cancelWorkflow(leftBehind);
    }, 60_000);

    it('reads a connection whose version-scoped holder is on another version', async () => {
      const id = 'left-behind-2';
      const leftBehind = await Deploys.seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${DBOS.applicationVersion}-${id}`,
        appVersion: previousDeploy,
      });

      await workflows.syncConnection({ connectionId: id });

      await vi.waitFor(() => {
        expect(Deploys.of(id)).toHaveLength(1);
      }, settle);
      reconcile.release();
      await DBOS.cancelWorkflow(leftBehind);
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)(
  'GithubReconcileWorkflows with a holder that stopped making progress',
  () => {
    it('reads a connection whose holder on this version has waited longer than two schedule intervals', async () => {
      const id = 'stuck-holder-1';
      const holderId = await Deploys.seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${DBOS.applicationVersion}-${id}`,
      });
      await Deploys.sql(
        'update dbos.workflow_status set created_at = $1 where workflow_uuid = $2',
        [Date.now() - 31 * 60_000, holderId],
      );

      await workflows.syncConnection({ connectionId: id });

      await vi.waitFor(() => {
        expect(Deploys.of(id)).toHaveLength(1);
      }, settle);
      expect((await DBOS.getWorkflowStatus(holderId))?.status).toBe(
        'CANCELLED',
      );
      reconcile.release();
    }, 60_000);

    it('keeps attaching to a recent holder on this version', async () => {
      const id = 'fresh-holder-1';
      const holderId = await Deploys.seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${DBOS.applicationVersion}-${id}`,
      });

      await workflows.syncConnection({ connectionId: id });

      expect((await DBOS.getWorkflowStatus(holderId))?.status).toBe('DELAYED');
      expect(Deploys.of(id)).toHaveLength(0);
      await DBOS.cancelWorkflow(holderId);
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)('DbosStrandedWorkflowRecovery', () => {
  it('re-runs queued work a previous deploy stranded, so the next reconcile syncs it', async () => {
    const id = 'stranded-1';
    const strandedId = await Deploys.seedHolder({
      connectionId: id,
      deduplicationID: `github-reconcile-${id}`,
      appVersion: previousDeploy,
    });

    const moved = await new DbosStrandedWorkflowRecovery({
      graceMs: 0,
    }).recover();

    expect(moved).toBeGreaterThanOrEqual(1);
    await vi.waitFor(() => {
      expect(Deploys.of(id)).toHaveLength(1);
    }, settle);
    expect((await DBOS.getWorkflowStatus(strandedId))?.applicationVersion).toBe(
      DBOS.applicationVersion,
    );
    reconcile.release();
  }, 60_000);

  it('leaves work that has started, or was queued moments ago, alone', async () => {
    const id = 'running-1';
    const runningId = await Deploys.seedHolder({
      connectionId: id,
      deduplicationID: `github-reconcile-${id}`,
      appVersion: previousDeploy,
    });
    await Deploys.sql(
      "update dbos.workflow_status set status = 'PENDING' where workflow_uuid = $1",
      [runningId],
    );
    const recentId = await Deploys.seedHolder({
      connectionId: 'recent-1',
      deduplicationID: 'github-reconcile-recent-1',
      appVersion: previousDeploy,
    });

    const withGrace = await new DbosStrandedWorkflowRecovery().recover();
    expect(withGrace).toBe(0);
    expect((await DBOS.getWorkflowStatus(recentId))?.applicationVersion).toBe(
      previousDeploy,
    );

    await new DbosStrandedWorkflowRecovery({ graceMs: 0 }).recover();
    expect((await DBOS.getWorkflowStatus(runningId))?.status).toBe('PENDING');
    expect(Deploys.of(id)).toHaveLength(0);
    reconcile.release();
  }, 60_000);
});

describe.skipIf(databaseUrl === null)(
  'GithubReconcileWorkflows scheduled runs',
  () => {
    it('counts stranded work without moving it', async () => {
      const id = 'counted-1';
      const counted = await Deploys.seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${id}`,
        appVersion: previousDeploy,
      });

      const count = await new DbosStrandedWorkflowRecovery({
        graceMs: 0,
      }).count();

      expect(count).toBeGreaterThanOrEqual(1);
      expect(await new DbosStrandedWorkflowRecovery().count()).toBe(0);
      await DBOS.cancelWorkflow(counted);
    }, 60_000);

    it('warns about a connection that has not synced for three schedule intervals', async () => {
      const warn = vi.spyOn(DBOS.logger, 'warn');
      reconcile.stale = [
        {
          connectionId: 'ggc-1',
          lastSyncedAt: new Date(Date.now() - 60 * 60_000),
        },
      ];
      reconcile.due = [];

      await Deploys.runScheduled();

      reconcile.stale = [];
      reconcile.due = ['acme'];
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /connection ggc-1 has not synced for (59|60|61) minutes/,
        ),
        expect.anything(),
      );
      warn.mockRestore();
    }, 60_000);
  },
);
