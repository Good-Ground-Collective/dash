import { agentHeartbeatStatuses } from '@good-ground-collective/agentic-communication-standards';
import { describe, expect, it } from 'vitest';
import { agentStatuses } from '#lib/agents/agent-session-contracts.ts';

describe('agentStatuses', () => {
  it('lists the statuses the agent heartbeat standard defines', () => {
    expect(agentStatuses).toEqual(agentHeartbeatStatuses);
  });
});
