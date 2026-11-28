import { describe, expect, it } from 'vitest';

import type { StrandedWorkflowRecovery } from '#src/platform/services/workflows/stranded-workflow-recovery.ts';
import { UnregisteredStrandedWorkflowGauge } from '#src/platform/services/workflows/unregistered-stranded-workflow-gauge.ts';

class RecoveryWithUnregistered implements StrandedWorkflowRecovery {
  untilGateOpensMs(): number {
    return 0;
  }

  async count(): Promise<number> {
    return 5;
  }

  async countUnregistered(): Promise<number> {
    return 2;
  }

  async recover(): Promise<number> {
    return 0;
  }
}

describe('UnregisteredStrandedWorkflowGauge', () => {
  it('reports the unregistered count under its own name, not the movable one', async () => {
    const gauge = new UnregisteredStrandedWorkflowGauge({
      recovery: new RecoveryWithUnregistered(),
    });

    expect(gauge.name).toBe('unregisteredStrandedWorkflows');
    expect(await gauge.read()).toBe(2);
  });
});
