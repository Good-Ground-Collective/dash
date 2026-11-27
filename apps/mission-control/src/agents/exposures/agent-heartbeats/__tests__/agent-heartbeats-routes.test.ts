import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  agent,
  AgentHeartbeatFixtures,
  bench,
  sessionId,
} from '#src/agents/__tests__/support/agent-heartbeat-fixtures.ts';
import { AgentsHarness } from '#src/agents/__tests__/support/agents-harness.ts';

let served: AgentsHarness;

beforeEach(async () => {
  served = await AgentsHarness.start();
  await served.useBenchKey(bench);
});

afterEach(async () => {
  await served.stop();
});

const message = AgentHeartbeatFixtures.message;

describe('POST /api/agents/:agentName/heartbeats', () => {
  it('stores a v1 heartbeat, drops fields it doesn’t know, and answers the stored row', async () => {
    const question = { text: 'Merge it?', options: [{ label: 'Yes' }] };

    const response = await served.send(
      JSON.stringify({
        ...message({ seq: 3, status: 'question', question }),
        unknownField: 'dropped',
      }),
    );

    expect(response).toMatchObject({
      statusCode: 201,
      body: {
        agentName: 'seth-laptop',
        benchId: 'studio-mac',
        sessionId,
        seq: 3,
        agentId: null,
        harness: 'claude-code',
        status: 'question',
        question,
      },
    });
    expect(response.body).not.toHaveProperty('unknownField');
  });

  it('answers a repeated (sessionId, seq) with the stored row and stores it once', async () => {
    const first = await served.send(
      JSON.stringify(message({ seq: 1, summary: 'First' })),
    );
    const repeat = await served.send(
      JSON.stringify(message({ seq: 1, summary: 'Second' })),
    );

    expect(first.statusCode).toBe(201);
    expect(repeat).toEqual({ statusCode: 200, body: first.body });
    expect(served.records.heartbeats).toHaveLength(1);
    expect(served.published).toHaveLength(1);
  });

  it.each([
    ['a major version it doesn’t know', { schemaVersion: '2.0' }],
    ['another message kind', { kind: 'example.ping' }],
  ])('refuses %s', async (_label, change) => {
    const response = await served.send(
      JSON.stringify({ ...message(), ...change }),
    );

    expect(response.statusCode).toBe(400);
    expect(served.records.heartbeats).toEqual([]);
  });

  it('accepts a later minor version of 1', async () => {
    const response = await served.send(
      JSON.stringify({ ...message(), schemaVersion: '1.4' }),
    );

    expect(response.statusCode).toBe(201);
  });
});

describe('POST /api/agents/:agentName/heartbeats session state', () => {
  it('never moves session state backwards for a heartbeat that arrives late', async () => {
    await served.send(JSON.stringify(message({ seq: 5, status: 'complete' })));
    const late = await served.send(
      JSON.stringify(message({ seq: 4, status: 'working' })),
    );
    const sessions = await served.sessions({
      headers: { cookie: served.cookie },
    });

    expect(late.statusCode).toBe(201);
    expect(sessions.body).toMatchObject({
      sessions: [{ parent: { status: 'complete', highestSeq: 5 } }],
    });
    expect(served.published.map((event) => event.type)).toEqual([
      'agent.session.updated',
    ]);
  });

  it('updates a subagent’s own row under its parent session', async () => {
    await served.send(JSON.stringify(message({ seq: 1, status: 'working' })));
    await served.send(
      JSON.stringify(
        message({
          seq: 2,
          agentId: 'explore-1',
          status: 'complete',
          summary: 'Found it.',
        }),
      ),
    );
    const sessions = await served.sessions({
      headers: { cookie: served.cookie },
    });

    expect(served.published.at(-1)).toMatchObject({
      type: 'agent.session.updated',
      data: { sessionId, agentId: 'explore-1', status: 'complete' },
    });
    expect(sessions.body).toMatchObject({
      sessions: [
        {
          sessionId,
          parent: { status: 'working', highestSeq: 1 },
          subagents: [
            { agentId: 'explore-1', status: 'complete', highestSeq: 2 },
          ],
        },
      ],
    });
  });
});

describe('POST /api/agents/:agentName/heartbeats/batch', () => {
  it('answers one result per heartbeat, so an invalid one doesn’t block the rest', async () => {
    const response = await served.sendBatch(
      JSON.stringify({
        heartbeats: [
          message({ seq: 1 }),
          { ...message({ seq: 2 }), schemaVersion: '2.0' },
          message({ seq: 1 }),
          message({ seq: 3, status: 'complete' }),
        ],
      }),
    );

    expect(response).toMatchObject({
      statusCode: 200,
      body: {
        results: [
          { outcome: 'created', heartbeat: { seq: 1 } },
          { outcome: 'invalid', issues: [{ path: 'schemaVersion' }] },
          { outcome: 'duplicate', heartbeat: { seq: 1 } },
          { outcome: 'created', heartbeat: { seq: 3 } },
        ],
      },
    });
    expect(served.records.heartbeats.map(({ seq }) => seq)).toEqual([1, 3]);
  });

  it.each([
    ['an empty batch', 0],
    ['more than 100 heartbeats', 101],
  ])('refuses %s', async (_label, count) => {
    const heartbeats = Array.from({ length: count }, (_, seq) =>
      message({ seq }),
    );

    const response = await served.sendBatch(JSON.stringify({ heartbeats }));

    expect(response.statusCode).toBe(400);
    expect(served.records.heartbeats).toEqual([]);
  });

  it('refuses the whole batch when an agent key names another agent', async () => {
    const { secret } = await served.keyFor(agent);

    const response = await served.post({
      path: 'claude-code/heartbeats/batch',
      headers: { authorization: `Bearer ${secret}` },
      json: JSON.stringify({ heartbeats: [message()] }),
    });

    expect(response).toMatchObject({
      statusCode: 403,
      body: { code: 'AGENT_MISMATCH' },
    });
    expect(served.records.heartbeats).toEqual([]);
  });
});
