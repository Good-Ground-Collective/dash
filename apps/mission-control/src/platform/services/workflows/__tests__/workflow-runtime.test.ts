import { DBOS } from '@dbos-inc/dbos-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import {
  databaseUrl,
  gateMs,
  LaunchFixture,
  Versions,
} from '#src/platform/services/workflows/__tests__/support/workflow-launch-fixture.ts';
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
      databaseUrl,
      logLevel: 'info',
    });

    await expect(runtime.check()).rejects.toThrow('DBOS is not launched');
  });
});

describe('DbosWorkflowRuntime stranded work sweep', () => {
  let fixture: LaunchFixture;

  beforeEach(() => {
    fixture = new LaunchFixture();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies the recovery workflow on the 15-minute schedule', async () => {
    await fixture.runtime().launch();

    expect(DBOS.applySchedules).toHaveBeenCalledWith([
      expect.objectContaining({
        workflowFn: expect.any(Function),
        schedule: '0 */15 * * * *',
      }),
    ]);
  });

  it('does not sweep at launch, only once the previous container is gone', async () => {
    fixture.recovery.recover.mockResolvedValue(0);
    await fixture.runtime().launch();

    await vi.advanceTimersByTimeAsync(gateMs - 1);
    expect(fixture.recovery.recover).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.recovery.recover).toHaveBeenCalledTimes(1);
  });

  it('logs a failed sweep without failing launch, and still applies the schedule', async () => {
    fixture.recovery.recover.mockRejectedValue(new TypeError('database down'));

    await expect(fixture.runtime().launch()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(gateMs);

    expect(fixture.warn).toHaveBeenCalledWith(
      'Recovering stranded workflows failed: TypeError',
    );
    expect(DBOS.applySchedules).toHaveBeenCalledTimes(1);
  });

  it('does not sweep after shutdown', async () => {
    const stopping = fixture.runtime();
    await stopping.launch();

    await stopping.shutdown();
    await vi.advanceTimersByTimeAsync(gateMs);

    expect(fixture.recovery.recover).not.toHaveBeenCalled();
    expect(DBOS.shutdown).toHaveBeenCalled();
  });
});

describe('DbosWorkflowRuntime claiming the latest version at launch', () => {
  let fixture: LaunchFixture;

  beforeEach(() => {
    fixture = new LaunchFixture();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes this version the latest right after DBOS launches, so a rollback is not left behind', async () => {
    await fixture.runtime().launch();

    expect(DBOS.setLatestApplicationVersion).toHaveBeenCalledWith(
      'this-deploy',
    );
    expect(vi.mocked(DBOS.launch).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(DBOS.setLatestApplicationVersion).mock.invocationCallOrder[0] ??
        0,
    );
  });

  it('leaves "latest" alone, and says so, when a newer version holds it', async () => {
    vi.mocked(DBOS.getLatestApplicationVersion).mockResolvedValue(
      Versions.record('newer-deploy', 3_000),
    );

    await fixture.runtime().launch();

    expect(DBOS.setLatestApplicationVersion).not.toHaveBeenCalled();
    expect(fixture.warn).toHaveBeenCalledWith(
      expect.stringContaining('this-deploy did not claim it'),
    );
  });

  it('claims "latest" when it already holds it', async () => {
    vi.mocked(DBOS.getLatestApplicationVersion).mockResolvedValue(
      Versions.record('this-deploy', 2_000),
    );

    await fixture.runtime().launch();

    expect(DBOS.setLatestApplicationVersion).toHaveBeenCalledWith(
      'this-deploy',
    );
  });

  it('claims "latest" regardless of a newer holder when forced, as a rollback does', async () => {
    vi.mocked(DBOS.getLatestApplicationVersion).mockResolvedValue(
      Versions.record('newer-deploy', 3_000),
    );
    const rollback = new DbosWorkflowRuntime({
      databaseUrl,
      logLevel: 'info',
      forceLatestVersion: true,
      recovery: fixture.recovery,
    });

    await rollback.launch();

    expect(DBOS.setLatestApplicationVersion).toHaveBeenCalledWith(
      'this-deploy',
    );
  });
});
