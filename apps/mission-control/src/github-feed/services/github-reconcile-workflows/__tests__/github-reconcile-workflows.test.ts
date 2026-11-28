import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { z } from 'zod';

import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { InMemoryConnectionRepository } from '#src/connections/__tests__/support/in-memory-connections.ts';
import { InMemoryGithubRecords } from '#src/github-feed/__tests__/support/in-memory-github-records.ts';
import { HeldReconcile } from '#src/github-feed/__tests__/support/held-reconcile.ts';
import { InMemorySyncRequestRepository } from '#src/github-feed/__tests__/support/in-memory-sync-requests.ts';
import { ReconcileNotRegisteredError } from '#src/github-feed/errors.ts';
import { GithubFeedEventHandler } from '#src/github-feed/services/github-feed-event-handler/github-feed-event-handler.ts';
import { SourcedGithubReconcile } from '#src/github-feed/services/github-reconcile/github-reconcile.ts';
import { GithubReconcileWorkflows } from '#src/github-feed/services/github-reconcile-workflows/github-reconcile-workflows.ts';
import { RecordedGithubSyncRequests } from '#src/github-feed/services/github-sync-requests/github-sync-requests.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

const databaseUrl = inject('databaseUrl');
const settle = { timeout: 15_000, interval: 100 };
const adaId = '00000000-0000-4000-8000-00000000000a';
const minReadGapMs = 60_000;
const followUpInputSchema = z.tuple([
  z.object({ connectionId: z.string(), startedAt: z.number() }),
]);
const readInputSchema = z.tuple([z.string()]);

describe('GithubReconcileWorkflows', () => {
  const records = new InMemoryGithubRecords();
  const workflows = new GithubReconcileWorkflows({
    reconcile: new SourcedGithubReconcile({
      sources: [],
      reader: records,
      writer: records,
    }),
    syncRequests: new InMemorySyncRequestRepository(),
  });

  it('refuses to activate before its workflows are registered', async () => {
    await expect(workflows.activate()).rejects.toThrow(
      ReconcileNotRegisteredError,
    );
  });

  it('refuses to start a person’s read before its workflows are registered', async () => {
    await expect(workflows.syncPerson({ userId: 'someone' })).rejects.toThrow(
      ReconcileNotRegisteredError,
    );
  });

  it('refuses to start a connection’s read before its workflows are registered', async () => {
    await expect(
      workflows.syncConnection({ connectionId: 'acme' }),
    ).rejects.toThrow(ReconcileNotRegisteredError);
  });
});

const reconcile = new HeldReconcile();
const connections = new InMemoryConnectionRepository();
const syncRequests = new RecordedGithubSyncRequests({
  connections,
  requests: new InMemorySyncRequestRepository(),
});
const workflows = new GithubReconcileWorkflows({ reconcile, syncRequests });
const pullRequests = new GithubFeedEventHandler({
  event: 'pull_request',
  actions: ['opened'],
  syncRequests,
  workflows,
});
let runtime: DbosWorkflowRuntime | undefined;

class Reads {
  static async finished(workflowName: string) {
    return DBOS.listWorkflows({ workflowName, status: 'SUCCESS' });
  }

  static async followUpsOf(connectionId: string) {
    const finished = await DBOS.listWorkflows({
      workflowName: 'githubReconcileFollowUp',
      status: 'SUCCESS',
      loadInput: true,
    });
    return finished.flatMap((followUp) =>
      (followUpInputSchema.safeParse(followUp.input).data ?? []).filter(
        (input) => input.connectionId === connectionId,
      ),
    );
  }

  static async unfinished(connectionId: string) {
    const unfinished = await DBOS.listWorkflows({
      workflowName: 'githubReconcileConnection',
      status: ['ENQUEUED', 'DELAYED', 'PENDING'],
      loadInput: true,
    });
    return unfinished.filter(
      (read) =>
        readInputSchema.safeParse(read.input).data?.[0] === connectionId,
    );
  }

  static of(connectionId: string) {
    return reconcile.synced.filter((synced) => synced === connectionId);
  }

  static async connection(installationId: string) {
    const { id } = await connections.saveOwned({
      provider: 'github',
      connectedBy: adaId,
      installation: { ...acmeInstallation, externalId: installationId },
    });
    return id;
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
      'drop database if exists dash_test_github_reconcile_workflows with (force)',
    );
  } finally {
    await server.end();
  }
  url.pathname = '/dash_test_github_reconcile_workflows';
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
  'GithubReconcileWorkflows on DBOS',
  () => {
    it('does not enqueue a connection again while its read is still running', async () => {
      await workflows.syncPerson({ userId: 'ada' });
      await vi.waitFor(() => {
        expect(Reads.of('acme')).toHaveLength(1);
      }, settle);

      await workflows.syncPerson({ userId: 'ada' });
      await vi.waitFor(async () => {
        expect(await Reads.finished('githubReconcilePerson')).toHaveLength(2);
      }, settle);

      expect(
        await DBOS.listWorkflows({ workflowName: 'githubReconcileConnection' }),
      ).toHaveLength(1);

      reconcile.release();
      await vi.waitFor(async () => {
        expect(await Reads.followUpsOf('acme')).toHaveLength(1);
      }, settle);
      await workflows.syncPerson({ userId: 'ada' });
      await vi.waitFor(() => {
        expect(Reads.of('acme')).toHaveLength(2);
      }, settle);
      reconcile.release();
    }, 60_000);
  },
);

describe.skipIf(databaseUrl === null)(
  'GithubReconcileWorkflows follow-ups',
  () => {
    it('does not read again when nothing changed during the read', async () => {
      const id = await Reads.connection('77');

      await workflows.syncConnection({ connectionId: id });
      await vi.waitFor(() => {
        expect(Reads.of(id)).toHaveLength(1);
      }, settle);
      reconcile.release();
      await vi.waitFor(async () => {
        expect(await Reads.followUpsOf(id)).toHaveLength(1);
      }, settle);

      expect(Reads.of(id)).toHaveLength(1);
    }, 60_000);

    it('reads once more, a minute after the earlier read started, when GitHub reports changes while a read is running', async () => {
      const id = await Reads.connection(acmeInstallation.externalId);
      const opened = {
        provider: 'github',
        deliveryId: 'race-1',
        event: 'pull_request',
        action: 'opened',
        installationId: acmeInstallation.externalId,
        installationChange: null,
      };

      await workflows.syncConnection({ connectionId: id });
      await vi.waitFor(() => {
        expect(Reads.of(id)).toHaveLength(1);
      }, settle);
      await pullRequests.handle(opened);
      await pullRequests.handle({ ...opened, deliveryId: 'race-2' });
      reconcile.release();

      await vi.waitFor(async () => {
        expect(await Reads.followUpsOf(id)).toHaveLength(1);
      }, settle);
      await pullRequests.handle({ ...opened, deliveryId: 'race-3' });
      const unfinished = await Reads.unfinished(id);
      expect(unfinished.map((read) => read.status)).toEqual(['DELAYED']);
      const [delayed] = unfinished;
      expect(Reads.of(id)).toHaveLength(1);
      const [first] = await Reads.followUpsOf(id);
      expect(delayed?.delayUntilEpochMS).toBeGreaterThanOrEqual(
        (first?.startedAt ?? Infinity) + minReadGapMs,
      );

      await DBOS.setWorkflowDelay(delayed?.workflowID ?? '', {
        delayUntilEpochMS: Date.now(),
      });
      await vi.waitFor(() => {
        expect(Reads.of(id)).toHaveLength(2);
      }, settle);
      reconcile.release();
      await vi.waitFor(async () => {
        expect(await Reads.followUpsOf(id)).toHaveLength(2);
      }, settle);
      expect(Reads.of(id)).toHaveLength(2);
    }, 60_000);
  },
);
