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

import {
  previousDeploy,
  settle,
  StaleDeployHarness,
} from '#src/github-feed/__tests__/support/stale-deploy-harness.ts';
import { DbosStrandedWorkflowRecovery } from '#src/platform/services/workflows/stranded-workflow-recovery.ts';

const databaseUrl = inject('databaseUrl');
const opened = { gateMs: 0 };
let deploys: StaleDeployHarness | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    deploys = await StaleDeployHarness.open({
      serverUrl: databaseUrl,
      name: 'dash_test_stranded_workflow_recovery',
    });
  }
});

afterEach(async () => {
  await deploys?.clear();
});

afterAll(async () => {
  await deploys?.close();
});

describe.skipIf(databaseUrl === null)(
  'DbosStrandedWorkflowRecovery before the previous container is gone',
  () => {
    it('moves nothing, and counts nothing, while it may still be running', async () => {
      const queuedId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: 'gated-1',
        deduplicationID: 'github-reconcile-gated-1',
        appVersion: previousDeploy,
      });
      const runningId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: 'gated-2',
        deduplicationID: 'github-reconcile-gated-2',
        appVersion: previousDeploy,
      });
      await StaleDeployHarness.required(deploys).markPending({
        workflowId: runningId,
      });
      const closed = new DbosStrandedWorkflowRecovery();

      expect(await closed.count()).toBe(0);
      expect(await closed.recover()).toBe(0);

      expect((await DBOS.getWorkflowStatus(queuedId))?.applicationVersion).toBe(
        previousDeploy,
      );
      expect((await DBOS.getWorkflowStatus(runningId))?.status).toBe('PENDING');
      expect(
        StaleDeployHarness.required(deploys).readsOf('gated-1'),
      ).toHaveLength(0);
      expect(
        StaleDeployHarness.required(deploys).readsOf('gated-2'),
      ).toHaveLength(0);
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)(
  'DbosStrandedWorkflowRecovery once the previous container is gone',
  () => {
    it('re-runs queued work a previous deploy stranded, so the next reconcile syncs it', async () => {
      const id = 'stranded-1';
      const strandedId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${id}`,
        appVersion: previousDeploy,
      });

      const moved = await new DbosStrandedWorkflowRecovery(opened).recover();

      expect(moved).toBe(1);
      await vi.waitFor(() => {
        expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(
          1,
        );
      }, settle);
      expect(
        (await DBOS.getWorkflowStatus(strandedId))?.applicationVersion,
      ).toBe(DBOS.applicationVersion);
    }, 60_000);

    it('re-runs a started workflow of a previous deploy under its own ID, and counts it first', async () => {
      const id = 'running-1';
      const runningId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${id}`,
        appVersion: previousDeploy,
      });
      await StaleDeployHarness.required(deploys).markPending({
        workflowId: runningId,
      });
      const recovery = new DbosStrandedWorkflowRecovery(opened);

      expect(await recovery.count()).toBe(1);
      expect(await recovery.recover()).toBe(1);

      await vi.waitFor(() => {
        expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(
          1,
        );
      }, settle);
      const rewound = await DBOS.getWorkflowStatus(runningId);
      expect(rewound?.applicationVersion).toBe(DBOS.applicationVersion);
      expect(rewound?.queueName).toBe('github-reconcile');
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)(
  'DbosStrandedWorkflowRecovery work it must not move',
  () => {
    it('leaves internal-queue, current-version and queueless started work alone', async () => {
      const internalId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: 'internal-1',
        deduplicationID: 'github-reconcile-internal-1',
        appVersion: previousDeploy,
      });
      const currentId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: 'current-1',
        deduplicationID: 'github-reconcile-current-1',
      });
      const queuelessId = await StaleDeployHarness.required(deploys).seedHolder(
        {
          connectionId: 'queueless-1',
          deduplicationID: 'github-reconcile-queueless-1',
          appVersion: previousDeploy,
        },
      );
      for (const workflowId of [internalId, currentId, queuelessId]) {
        await StaleDeployHarness.required(deploys).markPending({ workflowId });
      }
      await StaleDeployHarness.required(deploys).sql(
        "update dbos.workflow_status set queue_name = '_dbos_internal_queue' where workflow_uuid = $1",
        [internalId],
      );
      await StaleDeployHarness.required(deploys).sql(
        'update dbos.workflow_status set queue_name = null where workflow_uuid = $1',
        [queuelessId],
      );
      const recovery = new DbosStrandedWorkflowRecovery(opened);

      expect(await recovery.count()).toBe(0);
      expect(await recovery.recover()).toBe(0);

      for (const workflowId of [internalId, currentId, queuelessId]) {
        expect((await DBOS.getWorkflowStatus(workflowId))?.status).toBe(
          'PENDING',
        );
      }
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)(
  'DbosStrandedWorkflowRecovery and deduplication IDs',
  () => {
    it('lets the ID of a recovered unversioned workflow be enqueued again once it completes', async () => {
      const id = 'briefing-like-1';
      const deduplicationID = `briefing-${id}`;
      const runningId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID,
        appVersion: previousDeploy,
      });
      await StaleDeployHarness.required(deploys).markPending({
        workflowId: runningId,
      });

      await new DbosStrandedWorkflowRecovery(opened).recover();
      await vi.waitFor(() => {
        expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(
          1,
        );
      }, settle);
      StaleDeployHarness.required(deploys).reconcile.release();
      await vi.waitFor(async () => {
        expect((await DBOS.getWorkflowStatus(runningId))?.status).toBe(
          'SUCCESS',
        );
      }, settle);

      const again = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID,
      });

      expect(again).not.toBe(runningId);
    }, 60_000);
  },
);
