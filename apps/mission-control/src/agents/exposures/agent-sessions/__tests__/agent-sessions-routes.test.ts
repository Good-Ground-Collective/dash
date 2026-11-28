import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agent,
  AgentHeartbeatFixtures,
  bench,
} from '#src/agents/__tests__/support/agent-heartbeat-fixtures.ts';
import { AgentsHarness } from '#src/agents/__tests__/support/agents-harness.ts';
import { agentSessionsSchema } from '#src/agents/contracts/agent-session.ts';

let served: AgentsHarness;

beforeEach(async () => {
  served = await AgentsHarness.start();
  await served.useBenchKey(bench);
});

afterEach(async () => {
  vi.useRealTimers();
  await served.stop();
});

describe('GET /api/agents/sessions', () => {
  it.each([
    ['an API key', true],
    ['no session', false],
  ])('answers 401 to %s', async (_label, withKey) => {
    const headers = withKey
      ? { authorization: `Bearer ${(await served.keyFor(agent)).secret}` }
      : {};

    const response = await served.sessions({ headers });

    expect(response).toMatchObject({
      statusCode: 401,
      body: { code: 'SIGN_IN_REQUIRED' },
    });
  });
});

describe('GET /api/agents/sessions listing', () => {
  it('lists the most recently updated session first, with subagents under it even before their parent reports', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    const report = async (
      payload: Parameters<typeof AgentHeartbeatFixtures.message>[0],
    ) => {
      vi.setSystemTime(Date.now() + 1000);
      await served.send(
        JSON.stringify(AgentHeartbeatFixtures.message(payload)),
      );
    };
    await report({ sessionId: 'session-a', seq: 1, agentId: 'plan-1' });
    await report({
      sessionId: 'session-b',
      seq: 1,
      summary: 'Reading',
      taskId: 'task-42',
      machine: 'studio-mac.local',
    });
    await report({ sessionId: 'session-a', seq: 2, agentId: 'plan-1' });
    await report({ sessionId: 'session-b', seq: 2 });

    const response = await served.sessions({
      headers: { cookie: served.cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(agentSessionsSchema.parse(response.body)).toMatchObject({
      sessions: [
        {
          sessionId: 'session-b',
          reporterName: 'seth-laptop',
          benchId: 'studio-mac',
          harness: 'claude-code',
          parent: {
            highestSeq: 2,
            summary: 'Reading',
            taskId: 'task-42',
            machine: 'studio-mac.local',
            error: null,
          },
          subagents: [],
        },
        {
          sessionId: 'session-a',
          parent: null,
          subagents: [{ agentId: 'plan-1', highestSeq: 2 }],
        },
      ],
    });
  });
});
