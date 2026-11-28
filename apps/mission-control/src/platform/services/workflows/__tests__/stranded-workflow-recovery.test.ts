import { getFunctionRegistrationByName } from '@dbos-inc/dbos-sdk/internal/decorators';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Queued,
  Spies,
  Sweep,
  startedAt,
} from '#src/platform/services/workflows/__tests__/support/stranded-recovery-spies.ts';
import {
  DbosStrandedWorkflowRecovery,
  previousContainerGoneAfterMs,
} from '#src/platform/services/workflows/stranded-workflow-recovery.ts';

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

describe('DbosStrandedWorkflowRecovery work this version has no workflow for', () => {
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

  it('treats a class-based workflow whose class no longer exists as unregistered instead of throwing', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([
      Queued.workflow({
        workflowID: 'removed-class',
        workflowClassName: 'RemovedClass',
        workflowName: 'removedMethod',
      }),
    ]);
    Sweep.openGate();

    expect(await recovery.count()).toBe(0);
    expect(await recovery.countUnregistered()).toBe(1);
    expect(await recovery.recover()).toBe(0);

    expect(spies.cancel).not.toHaveBeenCalled();
    expect(spies.rewind).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledWith(
      expect.stringMatching(/removed-class.*removedMethod/),
    );
  });

  it('counts unregistered work separately from what it would move, and none while the gate is closed', async () => {
    const recovery = new DbosStrandedWorkflowRecovery();
    spies.list.mockResolvedValue([
      Queued.workflow({
        workflowID: 'removed',
        workflowName: 'removedInThisVersion',
      }),
      Queued.workflow({ workflowID: 'known' }),
    ]);

    expect(await recovery.countUnregistered()).toBe(0);

    Sweep.openGate();
    expect(await recovery.countUnregistered()).toBe(1);
    expect(await recovery.count()).toBe(1);
    expect(spies.warn).not.toHaveBeenCalled();
  });
});

class LookupChangedError extends Error {
  override name = 'LookupChangedError';
}

describe('the DBOS registration lookup that unregistered-work detection depends on', () => {
  it('throws for an unknown class name, which recovery treats as not registered', () => {
    expect(() =>
      getFunctionRegistrationByName('RemovedClass', 'removedMethod'),
    ).toThrow();
  });

  it('does not swallow a lookup failure for a free-function workflow', async () => {
    const recovery = new DbosStrandedWorkflowRecovery({
      findRegistration: (className, workflowName) => {
        if (className === '') {
          throw new LookupChangedError('lookup changed');
        }
        return getFunctionRegistrationByName(className, workflowName);
      },
    });
    spies.list.mockResolvedValue([Queued.workflow()]);
    Sweep.openGate();

    await expect(recovery.count()).rejects.toThrow('lookup changed');
  });
});
