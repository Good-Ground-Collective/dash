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

const databaseUrl = inject('databaseUrl');
let deploys: StaleDeployHarness | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    deploys = await StaleDeployHarness.open({
      serverUrl: databaseUrl,
      name: 'dash_test_github_reconcile_deploys',
      readTimeoutMs: 3_000,
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
  'GithubReconcileWorkflows across deploys',
  () => {
    it('reads a connection whose earlier read was left queued by a previous deploy', async () => {
      const id = 'left-behind-1';
      const leftBehind = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${id}`,
        appVersion: previousDeploy,
      });
      StaleDeployHarness.required(deploys).reconcile.due = [id];

      await StaleDeployHarness.required(deploys).runScheduled();

      await vi.waitFor(() => {
        expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(
          1,
        );
      }, settle);
      StaleDeployHarness.required(deploys).reconcile.due = ['acme'];
      expect(
        (await DBOS.getWorkflowStatus(leftBehind))?.applicationVersion,
      ).toBe(previousDeploy);
    }, 60_000);

    it('reads a connection whose version-scoped holder is on another version', async () => {
      const id = 'left-behind-2';
      await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${DBOS.applicationVersion}-${id}`,
        appVersion: previousDeploy,
      });

      await StaleDeployHarness.required(deploys).workflows.syncConnection({
        connectionId: id,
      });

      await vi.waitFor(() => {
        expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(
          1,
        );
      }, settle);
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)(
  'GithubReconcileWorkflows with a queued holder on this version',
  () => {
    it('attaches to it however long it has waited', async () => {
      const id = 'queued-holder-1';
      const holderId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${DBOS.applicationVersion}-${id}`,
      });
      await StaleDeployHarness.required(deploys).sql(
        'update dbos.workflow_status set created_at = $1 where workflow_uuid = $2',
        [StaleDeployHarness.minutesAgo(31), holderId],
      );

      await StaleDeployHarness.required(deploys).workflows.syncConnection({
        connectionId: id,
      });

      expect((await DBOS.getWorkflowStatus(holderId))?.status).toBe('DELAYED');
      expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(0);
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)(
  'GithubReconcileWorkflows with a running holder on this version',
  () => {
    it('attaches to it when it was created long ago but started recently', async () => {
      const id = 'recent-start-1';
      const holderId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${DBOS.applicationVersion}-${id}`,
      });
      await StaleDeployHarness.required(deploys).markPending({
        workflowId: holderId,
        createdAt: StaleDeployHarness.minutesAgo(40),
        startedAt: StaleDeployHarness.minutesAgo(1),
      });

      await StaleDeployHarness.required(deploys).workflows.syncConnection({
        connectionId: id,
      });

      expect((await DBOS.getWorkflowStatus(holderId))?.status).toBe('PENDING');
      expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(0);
    }, 60_000);

    it('cancels it once it started longer ago than two schedule intervals, and reads again', async () => {
      const id = 'stuck-holder-1';
      const holderId = await StaleDeployHarness.required(deploys).seedHolder({
        connectionId: id,
        deduplicationID: `github-reconcile-${DBOS.applicationVersion}-${id}`,
      });
      await StaleDeployHarness.required(deploys).markPending({
        workflowId: holderId,
        createdAt: StaleDeployHarness.minutesAgo(40),
        startedAt: StaleDeployHarness.minutesAgo(31),
      });

      await StaleDeployHarness.required(deploys).workflows.syncConnection({
        connectionId: id,
      });

      await vi.waitFor(() => {
        expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(
          1,
        );
      }, settle);
      expect((await DBOS.getWorkflowStatus(holderId))?.status).toBe(
        'CANCELLED',
      );
    }, 60_000);

    it('cancels a read that runs past the read timeout', async () => {
      const id = 'hung-read-1';

      await StaleDeployHarness.required(deploys).workflows.syncConnection({
        connectionId: id,
      });
      await vi.waitFor(() => {
        expect(StaleDeployHarness.required(deploys).readsOf(id)).toHaveLength(
          1,
        );
      }, settle);

      await vi.waitFor(async () => {
        expect(
          (await StaleDeployHarness.required(deploys).readOf(id))?.status,
        ).toBe('CANCELLED');
      }, settle);
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)(
  'GithubReconcileWorkflows scheduled runs',
  () => {
    it('warns about a connection that has not synced for three schedule intervals', async () => {
      const warn = vi.spyOn(DBOS.logger, 'warn');
      StaleDeployHarness.required(deploys).reconcile.stale = [
        {
          connectionId: 'ggc-1',
          lastSyncedAt: new Date(StaleDeployHarness.minutesAgo(60)),
        },
      ];
      StaleDeployHarness.required(deploys).reconcile.due = [];

      await StaleDeployHarness.required(deploys).runScheduled();

      StaleDeployHarness.required(deploys).reconcile.stale = [];
      StaleDeployHarness.required(deploys).reconcile.due = ['acme'];
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
