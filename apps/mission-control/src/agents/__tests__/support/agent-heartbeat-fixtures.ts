import type { AgentHeartbeatMessage } from '#src/agents/contracts/agent-heartbeat.ts';
import type { NewServiceAccount } from '#src/auth/contracts/service-account.ts';

export const sessionId = '3b7e9f20-5c4a-4d1e-8a6b-2f9c0d1e3a4b';

export const bench: NewServiceAccount = {
  kind: 'bench',
  name: 'Studio Mac',
  benchId: 'studio-mac',
  description: 'The desk machine',
  scopes: ['heartbeat:write', 'telemetry:write'],
};

/** A second bench, whose key must never see or move the first bench's sessions. */
export const otherBench: NewServiceAccount = {
  kind: 'bench',
  name: 'Other Mac',
  benchId: 'other-mac',
  description: 'Another desk',
  scopes: ['heartbeat:write'],
};

export const agent: NewServiceAccount = {
  kind: 'agent',
  name: 'CI reviewer',
  agentName: 'ci-reviewer',
  description: 'Runs in GitHub Actions',
  scopes: ['heartbeat:write'],
};

/** `agent.heartbeat` 1.0 messages for tests. */
export class AgentHeartbeatFixtures {
  /** A `working` heartbeat from the session itself at `seq` 0, with `payload` laid over it. */
  static message(
    payload: Partial<AgentHeartbeatMessage['payload']> = {},
  ): AgentHeartbeatMessage {
    return {
      schemaVersion: '1.0',
      kind: 'agent.heartbeat',
      id: crypto.randomUUID(),
      emittedAt: '2026-11-27T09:30:00.000Z',
      payload: {
        sessionId,
        seq: 0,
        harness: 'claude-code',
        status: 'working',
        ...payload,
      },
    };
  }

  /** A heartbeat at `seq` with every field at its longest, in characters JSON escapes to six bytes each. */
  static largest(seq: number): AgentHeartbeatMessage {
    const fill = (length: number): string => '\u0001'.repeat(length);
    return AgentHeartbeatFixtures.message({
      seq,
      sessionId: fill(256),
      agentId: fill(256),
      agent: { type: fill(100), model: fill(100) },
      status: 'question',
      summary: fill(500),
      question: {
        text: fill(2000),
        options: Array.from({ length: 10 }, () => ({
          label: fill(200),
          description: fill(500),
        })),
      },
      error: { kind: fill(100), message: fill(2000) },
      workspace: {
        directory: fill(1024),
        repository: fill(256),
        branch: fill(256),
      },
      machine: fill(256),
      taskId: fill(256),
    });
  }
}
