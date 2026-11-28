import {
  DBOS,
  type WorkflowHandle,
  type VersionInfo,
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

DBOS.registerWorkflow(async () => undefined, {
  name: 'githubReconcileConnection',
});

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

let spies: Spies;

beforeEach(() => {
  spies = new Spies();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DbosStrandedWorkflowRecovery', () => {
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

  it('warns about a workflow this version has no function for, leaves it alone, and does not count it', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([
      Queued.workflow({
        workflowID: 'removed',
        workflowName: 'removedInThisVersion',
        queueName: 'briefing',
      }),
      Queued.workflow({ workflowID: 'known' }),
    ]);
    Sweep.openGate();

    expect(await recovery.count()).toBe(1);
    expect(spies.warn).not.toHaveBeenCalled();
    expect(await recovery.recover()).toBe(1);

    expect(spies.cancel).toHaveBeenCalledTimes(1);
    expect(spies.cancel).toHaveBeenCalledWith('known');
    expect(spies.warn).toHaveBeenCalledWith(
      expect.stringMatching(/removed.*removedInThisVersion.*briefing/),
    );
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

describe('DbosStrandedWorkflowRecovery on a container that is not the latest version', () => {
  it('counts and moves nothing while a newer version is registered', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([Queued.workflow()]);
    spies.latest.mockResolvedValue(Queued.version('newer'));
    Sweep.openGate();

    expect(await recovery.count()).toBe(0);
    expect(await recovery.recover()).toBe(0);

    expect(spies.cancel).not.toHaveBeenCalled();
    expect(spies.rewind).not.toHaveBeenCalled();
  });

  it('moves work once this version is the latest', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([Queued.workflow()]);
    Sweep.openGate();

    expect(await recovery.recover()).toBe(1);
  });

  it('treats a failed latest-version lookup as not latest, without throwing', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([Queued.workflow()]);
    spies.latest.mockRejectedValue(new TypeError('connection refused'));
    Sweep.openGate();

    expect(await recovery.count()).toBe(0);
    expect(await recovery.recover()).toBe(0);

    expect(spies.cancel).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledWith(
      expect.stringContaining('TypeError'),
    );
  });
});

describe('DbosStrandedWorkflowRecovery re-reading a workflow before moving it', () => {
  it.each([
    ['now on the running version', { applicationVersion: 'current' }],
    ['already finished', { status: 'SUCCESS' as const }],
    ['already cancelled', { status: 'CANCELLED' as const }],
  ])('skips a workflow that is %s', async (_label, changed) => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([Queued.workflow()]);
    spies.status.mockResolvedValue(Queued.workflow(changed));
    Sweep.openGate();

    expect(await recovery.recover()).toBe(0);

    expect(spies.cancel).not.toHaveBeenCalled();
    expect(spies.rewind).not.toHaveBeenCalled();
  });

  it('skips a workflow that no longer exists', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([Queued.workflow()]);
    spies.status.mockResolvedValue(null);
    Sweep.openGate();

    expect(await recovery.recover()).toBe(0);
    expect(spies.cancel).not.toHaveBeenCalled();
  });

  it('moves a workflow the re-read still finds stranded', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([Queued.workflow()]);
    Sweep.openGate();

    expect(await recovery.recover()).toBe(1);
    expect(spies.status).toHaveBeenCalledWith('wf-1');
  });
});

describe('DbosStrandedWorkflowRecovery when the rewind fails after the cancel', () => {
  it('does not count it, warns that it was left cancelled, and carries on', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([
      Queued.workflow({ workflowID: 'half' }),
      Queued.workflow({ workflowID: 'fine' }),
    ]);
    spies.rewind.mockRejectedValueOnce(new RangeError('rewind refused'));
    Sweep.openGate();

    const moved = await recovery.recover();

    expect(moved).toBe(1);
    expect(spies.rewind).toHaveBeenCalledTimes(2);
    const warning = spies.warn.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.includes('left cancelled'));
    expect(warning).toContain('half');
    expect(warning).toContain('RangeError');
    expect(warning).toContain('manual re-run');
  });
});
