import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';

import { InMemoryGithubRecords } from '#src/github-feed/__tests__/support/in-memory-github-records.ts';
import { ReconcileNotRegisteredError } from '#src/github-feed/errors.ts';
import {
  type GithubReconcile,
  SourcedGithubReconcile,
  type SyncOutcome,
} from '#src/github-feed/services/github-reconcile/github-reconcile.ts';
import { GithubReconcileWorkflows } from '#src/github-feed/services/github-reconcile-workflows/github-reconcile-workflows.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

const databaseUrl = inject('databaseUrl');
const settle = { timeout: 15_000, interval: 100 };

class HeldReconcile implements GithubReconcile {
  readonly synced: string[] = [];
  private readonly hold = Promise.withResolvers<undefined>();

  async dueConnectionIds(): Promise<string[]> {
    return ['acme'];
  }

  async connectionIdsOf(): Promise<string[]> {
    return ['acme'];
  }

  async syncConnection(props: { connectionId: string }): Promise<SyncOutcome> {
    this.synced.push(props.connectionId);
    await this.hold.promise;
    return { status: 'synced' };
  }

  release(): void {
    this.hold.resolve(undefined);
  }
}

describe('GithubReconcileWorkflows', () => {
  const records = new InMemoryGithubRecords();
  const workflows = new GithubReconcileWorkflows({
    reconcile: new SourcedGithubReconcile({
      sources: [],
      reader: records,
      writer: records,
    }),
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
});

describe.skipIf(databaseUrl === null)(
  'GithubReconcileWorkflows on DBOS',
  () => {
    const reconcile = new HeldReconcile();
    const workflows = new GithubReconcileWorkflows({ reconcile });
    let runtime: DbosWorkflowRuntime | undefined;

    const finished = async (workflowName: string) =>
      DBOS.listWorkflows({ workflowName, status: 'SUCCESS' });

    beforeAll(async () => {
      const url = new URL(databaseUrl ?? '');
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

    it('does not enqueue a connection again while its read is still running', async () => {
      await workflows.syncPerson({ userId: 'ada' });
      await vi.waitFor(() => {
        expect(reconcile.synced).toEqual(['acme']);
      }, settle);

      await workflows.syncPerson({ userId: 'ada' });
      await vi.waitFor(async () => {
        expect(await finished('githubReconcilePerson')).toHaveLength(2);
      }, settle);

      expect(
        await DBOS.listWorkflows({ workflowName: 'githubReconcileConnection' }),
      ).toHaveLength(1);

      reconcile.release();
      await vi.waitFor(async () => {
        expect(await finished('githubReconcileConnection')).toHaveLength(1);
      }, settle);
      await workflows.syncPerson({ userId: 'ada' });
      await vi.waitFor(async () => {
        expect(await finished('githubReconcileConnection')).toHaveLength(2);
      }, settle);
      expect(reconcile.synced).toEqual(['acme', 'acme']);
    }, 60_000);
  },
);
