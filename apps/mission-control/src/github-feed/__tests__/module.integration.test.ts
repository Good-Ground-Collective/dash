import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';

import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import { adaId } from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubFeedHarness } from '#src/github-feed/__tests__/support/github-feed-harness.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

const databaseUrl = inject('databaseUrl');
const readInputSchema = z.tuple([z.string()]);
const harness = new GithubFeedHarness();
let runtime: DbosWorkflowRuntime | undefined;

harness.module.registerWorkflows();
const reinstate = DBOS.registerWorkflow(
  async (props: { provider: string; installationId: string }) =>
    harness.module.reinstated(props),
  { name: 'testGithubFeedReinstated' },
);

class Reads {
  static async enqueued(): Promise<string[]> {
    const reads = await DBOS.listWorkflows({
      workflowName: 'githubReconcileConnection',
      loadInput: true,
    });
    return reads.flatMap(
      (read) => readInputSchema.safeParse(read.input).data ?? [],
    );
  }

  static async reinstated(props: {
    provider: string;
    installationId: string;
  }): Promise<void> {
    const handle = await DBOS.startWorkflow(reinstate)(props);
    await handle.getResult();
  }

  static async connection(installationId: string): Promise<string> {
    const { id } = await harness.connections.saveOwned({
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
      'drop database if exists dash_test_github_feed_module with (force)',
    );
  } finally {
    await server.end();
  }
  url.pathname = '/dash_test_github_feed_module';
  runtime = new DbosWorkflowRuntime({
    databaseUrl: url.toString(),
    logLevel: 'error',
  });
  await runtime.launch();
  await harness.module.activate();
});

afterAll(async () => {
  await runtime?.shutdown();
});

describe.skipIf(databaseUrl === null)('GithubFeedModule reinstated', () => {
  it('records a sync request and enqueues a read of a reinstated GitHub connection', async () => {
    const connectionId = await Reads.connection('42');

    await Reads.reinstated({ provider: 'github', installationId: '42' });

    expect(harness.syncRequests.requested.has(connectionId)).toBe(true);
    expect(await Reads.enqueued()).toContain(connectionId);
  }, 30_000);

  it('reads nothing for another provider', async () => {
    const connectionId = await Reads.connection('43');

    await Reads.reinstated({ provider: 'jira', installationId: '43' });

    expect(harness.syncRequests.requested.has(connectionId)).toBe(false);
    expect(await Reads.enqueued()).not.toContain(connectionId);
  }, 30_000);

  it('reads nothing for an installation Dash has no connection for', async () => {
    const requestsBefore = harness.syncRequests.requested.size;
    const readsBefore = await Reads.enqueued();

    await Reads.reinstated({ provider: 'github', installationId: '99' });

    expect(harness.syncRequests.requested.size).toBe(requestsBefore);
    expect(await Reads.enqueued()).toEqual(readsBefore);
  }, 30_000);
});
