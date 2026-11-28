import {
  DBOS,
  type VersionInfo,
  type WorkflowHandle,
  type WorkflowStatus,
} from '@dbos-inc/dbos-sdk';
import { type MockInstance, vi } from 'vitest';

import { previousContainerGoneAfterMs } from '#src/platform/services/workflows/stranded-workflow-recovery.ts';

DBOS.registerWorkflow(async () => undefined, {
  name: 'githubReconcileConnection',
});

export const startedAt = new Date('2026-11-27T10:00:00Z');

export class Queued {
  static workflow(overrides: Partial<WorkflowStatus> = {}): WorkflowStatus {
    return {
      workflowID: 'wf-1',
      workflowName: 'githubReconcileConnection',
      workflowClassName: '',
      status: 'ENQUEUED',
      queueName: 'github-reconcile',
      applicationVersion: 'previous-deploy',
      priority: 0,
      createdAt: startedAt.getTime(),
      ...overrides,
    };
  }

  static version(versionName: string): VersionInfo {
    return {
      versionId: 'v-1',
      versionName,
      versionTimestamp: startedAt.getTime(),
      createdAt: startedAt.getTime(),
    };
  }

  static queueless(workflowID: string): WorkflowStatus {
    return {
      workflowID,
      workflowName: 'githubReconcileConnection',
      workflowClassName: '',
      status: 'PENDING',
      applicationVersion: 'previous-deploy',
      priority: 0,
      createdAt: startedAt.getTime(),
    };
  }
}

export class MovedHandle implements WorkflowHandle<undefined> {
  readonly workflowID = 'moved';

  async getStatus(): Promise<WorkflowStatus | null> {
    return null;
  }

  async getResult(): Promise<undefined> {
    return undefined;
  }
}

export class Sweep {
  static openGate() {
    vi.setSystemTime(
      new Date(startedAt.getTime() + previousContainerGoneAfterMs),
    );
  }
}

export class Spies {
  readonly list: MockInstance<typeof DBOS.listQueuedWorkflows>;
  readonly cancel: MockInstance<typeof DBOS.cancelWorkflow>;
  readonly rewind: MockInstance<typeof DBOS.rewindWorkflow>;
  readonly latest: MockInstance<typeof DBOS.getLatestApplicationVersion>;
  readonly status: MockInstance<typeof DBOS.getWorkflowStatus>;
  readonly warn = vi.fn();

  constructor() {
    vi.useFakeTimers({ toFake: ['Date'], now: startedAt });
    this.list = vi.spyOn(DBOS, 'listQueuedWorkflows');
    this.cancel = vi.spyOn(DBOS, 'cancelWorkflow').mockResolvedValue(undefined);
    this.rewind = vi
      .spyOn(DBOS, 'rewindWorkflow')
      .mockResolvedValue(new MovedHandle());
    this.latest = vi
      .spyOn(DBOS, 'getLatestApplicationVersion')
      .mockResolvedValue(Queued.version('current'));
    this.status = vi
      .spyOn(DBOS, 'getWorkflowStatus')
      .mockImplementation(async (workflowID) =>
        Queued.workflow({ workflowID }),
      );
    vi.spyOn(DBOS, 'applicationVersion', 'get').mockReturnValue('current');
    const logger = DBOS.logger;
    vi.spyOn(logger, 'warn').mockImplementation(this.warn);
    vi.spyOn(DBOS, 'logger', 'get').mockReturnValue(logger);
  }
}
