import { describe, expect, it } from 'vitest';

import { AgentHeartbeatRetentionNotRegisteredError } from '#src/agents/errors.ts';
import type { AgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import { AgentHeartbeatRetentionWorkflows } from '#src/agents/services/agent-heartbeat-retention-workflows/agent-heartbeat-retention-workflows.ts';

class RecordedCutoffs implements Pick<
  AgentHeartbeatRepository,
  'deleteReceivedBefore'
> {
  readonly cutoffs: Date[] = [];

  async deleteReceivedBefore(props: { cutoff: Date }): Promise<number> {
    this.cutoffs.push(props.cutoff);
    return 3;
  }
}

describe('AgentHeartbeatRetentionWorkflows', () => {
  it('deletes heartbeats received more than 30 days before the fire time', async () => {
    const repository = new RecordedCutoffs();
    const firedAt = new Date('2026-11-27T03:30:00Z');

    const deleted = await new AgentHeartbeatRetentionWorkflows({
      repository,
    }).prune({ now: firedAt });

    expect(deleted).toBe(3);
    expect(repository.cutoffs).toEqual([new Date('2026-10-28T03:30:00Z')]);
  });

  it('refuses to activate before its workflow is registered', async () => {
    const workflows = new AgentHeartbeatRetentionWorkflows({
      repository: new RecordedCutoffs(),
    });

    await expect(workflows.activate()).rejects.toThrow(
      AgentHeartbeatRetentionNotRegisteredError,
    );
  });
});
