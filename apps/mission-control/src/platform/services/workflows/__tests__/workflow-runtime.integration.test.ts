import { DBOS } from '@dbos-inc/dbos-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  databaseUrl,
  LaunchFixture,
  Versions,
} from '#src/platform/services/workflows/__tests__/support/workflow-launch-fixture.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

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
