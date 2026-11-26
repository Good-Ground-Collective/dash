import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

describe('DbosWorkflowRuntime', () => {
  it('rejects a system database URL that is not Postgres', () => {
    expect(
      () =>
        new DbosWorkflowRuntime({
          databaseUrl: 'https://example.com',
          logLevel: 'info',
        }),
    ).toThrow(ZodError);
  });

  it('reports unhealthy before DBOS launches', async () => {
    const runtime = new DbosWorkflowRuntime({
      databaseUrl: 'postgres://dash:dash@127.0.0.1:54329/mission_control',
      logLevel: 'info',
    });

    await expect(runtime.check()).rejects.toThrow('DBOS is not launched');
  });
});
