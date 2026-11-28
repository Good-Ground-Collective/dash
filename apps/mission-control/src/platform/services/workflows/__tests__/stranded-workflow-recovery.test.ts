import {
  DBOS,
  type WorkflowHandle,
  type WorkflowStatus,
} from '@dbos-inc/dbos-sdk';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

import {
  DbosStrandedWorkflowRecovery,
  previousContainerGoneAfterMs,
} from '#src/platform/services/workflows/stranded-workflow-recovery.ts';

const startedAt = new Date('2026-11-27T10:00:00Z');

class Queued {
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

class MovedHandle implements WorkflowHandle<undefined> {
  readonly workflowID = 'moved';

  async getStatus(): Promise<WorkflowStatus | null> {
    return null;
  }

  async getResult(): Promise<undefined> {
    return undefined;
  }
}

class Sweep {
  static openGate() {
    vi.setSystemTime(
      new Date(startedAt.getTime() + previousContainerGoneAfterMs),
    );
  }
}

class Spies {
  readonly list: MockInstance<typeof DBOS.listQueuedWorkflows>;
  readonly cancel: MockInstance<typeof DBOS.cancelWorkflow>;
  readonly rewind: MockInstance<typeof DBOS.rewindWorkflow>;
  readonly warn = vi.fn();

  constructor() {
    vi.useFakeTimers({ toFake: ['Date'], now: startedAt });
    this.list = vi.spyOn(DBOS, 'listQueuedWorkflows');
    this.cancel = vi.spyOn(DBOS, 'cancelWorkflow').mockResolvedValue(undefined);
    this.rewind = vi
      .spyOn(DBOS, 'rewindWorkflow')
      .mockResolvedValue(new MovedHandle());
    vi.spyOn(DBOS, 'applicationVersion', 'get').mockReturnValue('current');
    const logger = DBOS.logger;
    vi.spyOn(logger, 'warn').mockImplementation(this.warn);
    vi.spyOn(DBOS, 'logger', 'get').mockReturnValue(logger);
  }
}

describe('DbosStrandedWorkflowRecovery', () => {
  let spies: Spies;

  beforeEach(() => {
    spies = new Spies();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('moves nothing and counts nothing until the previous container is gone', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([Queued.workflow()]);
    vi.setSystemTime(
      new Date(startedAt.getTime() + previousContainerGoneAfterMs - 1),
    );

    expect(await recovery.count()).toBe(0);
    expect(await recovery.recover()).toBe(0);

    expect(spies.cancel).not.toHaveBeenCalled();
    expect(spies.rewind).not.toHaveBeenCalled();
    expect(recovery.untilGateOpensMs()).toBe(1);
  });

  it('moves queued and running work from another version once the gate opens', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([
      Queued.workflow({ workflowID: 'old-queued' }),
      Queued.workflow({ workflowID: 'old-running', status: 'PENDING' }),
    ]);
    Sweep.openGate();

    expect(await recovery.count()).toBe(2);
    expect(await recovery.recover()).toBe(2);

    expect(spies.rewind).toHaveBeenCalledWith('old-running', {
      applicationVersion: 'current',
      queueName: 'github-reconcile',
    });
    expect(recovery.untilGateOpensMs()).toBe(0);
  });

  it('asks for neither inputs nor outputs of what it lists', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([]);
    Sweep.openGate();

    await recovery.count();

    expect(spies.list).toHaveBeenCalledWith({
      status: ['ENQUEUED', 'DELAYED', 'PENDING'],
      loadInput: false,
      loadOutput: false,
    });
  });
});

describe('DbosStrandedWorkflowRecovery work it must not move or cannot move', () => {
  let spies: Spies;

  beforeEach(() => {
    spies = new Spies();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('leaves internal-queue, current-version and queueless work alone', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([
      Queued.workflow({
        workflowID: 'internal',
        queueName: '_dbos_internal_queue',
      }),
      Queued.workflow({ workflowID: 'current', applicationVersion: 'current' }),
      Queued.queueless('queueless'),
    ]);
    Sweep.openGate();

    expect(await recovery.recover()).toBe(0);
    expect(spies.cancel).not.toHaveBeenCalled();
  });

  it('keeps going when one workflow cannot be moved, and warns about it', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([
      Queued.workflow({ workflowID: 'broken' }),
      Queued.workflow({ workflowID: 'fine' }),
    ]);
    spies.cancel.mockRejectedValueOnce(new TypeError('connection refused'));
    Sweep.openGate();

    const moved = await recovery.recover();

    expect(moved).toBe(1);
    expect(spies.rewind).toHaveBeenCalledTimes(1);
    expect(spies.rewind).toHaveBeenCalledWith('fine', expect.anything());
    expect(spies.warn).toHaveBeenCalledWith(
      'Could not re-run stranded workflow broken on queue github-reconcile: TypeError',
    );
  });
});
