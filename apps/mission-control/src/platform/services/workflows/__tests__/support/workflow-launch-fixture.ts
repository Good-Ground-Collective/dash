import { DBOS, type VersionInfo } from '@dbos-inc/dbos-sdk';
import { vi } from 'vitest';

import type { StrandedWorkflowRecovery } from '#src/platform/services/workflows/stranded-workflow-recovery.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

export const gateMs = 5 * 60_000;
export const databaseUrl =
  'postgres://dash:dash@127.0.0.1:54329/mission_control';

class FakeStrandedWorkflowRecovery implements StrandedWorkflowRecovery {
  readonly recover = vi.fn<() => Promise<number>>();

  untilGateOpensMs(): number {
    return gateMs;
  }

  async count(): Promise<number> {
    return 0;
  }

  async countUnregistered(): Promise<number> {
    return 0;
  }
}

export class Versions {
  static record(versionName: string, createdAt: number): VersionInfo {
    return {
      versionId: versionName,
      versionName,
      versionTimestamp: createdAt,
      createdAt,
    };
  }
}

export class LaunchFixture {
  readonly recovery = new FakeStrandedWorkflowRecovery();
  readonly warn = vi.fn();

  constructor() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(DBOS, 'setConfig').mockImplementation(() => undefined);
    vi.spyOn(DBOS, 'launch').mockResolvedValue(undefined);
    vi.spyOn(DBOS, 'registerWorkflow').mockImplementation(
      (workflow) => workflow,
    );
    vi.spyOn(DBOS, 'applicationVersion', 'get').mockReturnValue('this-deploy');
    vi.spyOn(DBOS, 'setLatestApplicationVersion').mockResolvedValue(undefined);
    vi.spyOn(DBOS, 'getLatestApplicationVersion').mockResolvedValue(
      Versions.record('previous-deploy', 1_000),
    );
    vi.spyOn(DBOS, 'listApplicationVersions').mockResolvedValue([
      Versions.record('previous-deploy', 1_000),
      Versions.record('this-deploy', 2_000),
    ]);
    vi.spyOn(DBOS, 'applySchedules').mockResolvedValue(undefined);
    vi.spyOn(DBOS, 'shutdown').mockResolvedValue(undefined);
    const logger = DBOS.logger;
    vi.spyOn(logger, 'warn').mockImplementation(this.warn);
    vi.spyOn(DBOS, 'logger', 'get').mockReturnValue(logger);
  }

  runtime(): DbosWorkflowRuntime {
    return new DbosWorkflowRuntime({
      databaseUrl,
      logLevel: 'info',
      recovery: this.recovery,
    });
  }
}
