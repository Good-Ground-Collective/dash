import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agent,
  bench,
} from '#src/agents/__tests__/support/agent-heartbeat-fixtures.ts';
import { AgentsHarness } from '#src/agents/__tests__/support/agents-harness.ts';

let served: AgentsHarness;

const question = {
  text: 'Which database?',
  options: [{ label: 'Postgres', description: 'The default' }],
};

beforeEach(async () => {
  served = await AgentsHarness.start();
  await served.useBenchKey(bench);
});

afterEach(async () => {
  vi.useRealTimers();
  await served.stop();
});

describe('GET /api/needs-you', () => {
  it.each([
    ['an API key', true],
    ['no session', false],
  ])('answers 401 to %s', async (_label, withKey) => {
    const headers = withKey
      ? { authorization: `Bearer ${(await served.keyFor(agent)).secret}` }
      : {};

    const response = await served.needsYou({ headers });

    expect(response).toMatchObject({
      statusCode: 401,
      body: { code: 'SIGN_IN_REQUIRED' },
    });
  });

  it('lists the open items newest first', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
    await served.heartbeat({
      sessionId: 'older',
      seq: 1,
      status: 'question',
      question,
    });
    vi.setSystemTime(Date.now() + 1000);
    await served.heartbeat({
      sessionId: 'newer',
      seq: 1,
      status: 'question',
      question,
    });

    const items = await served.openNeedsYou();

    expect(items.map((item) => item.sessionId)).toEqual(['newer', 'older']);
  });
});

describe('Needs you triage opening', () => {
  it('opens one item carrying the question verbatim for a needs-input heartbeat', async () => {
    await served.heartbeat({ seq: 1, status: 'question', question });

    expect(await served.openNeedsYou()).toMatchObject([
      { agentId: null, question, resolvedAt: null },
    ]);
    expect(served.publishedNeedsYouTypes()).toEqual(['needs-you.opened']);
  });

  it('does not open a second item when the session reports needing input again', async () => {
    await served.heartbeat({ seq: 1, status: 'question', question });
    await served.heartbeat({ seq: 2, status: 'question', question });

    expect(await served.openNeedsYou()).toHaveLength(1);
    expect(served.publishedNeedsYouTypes()).toEqual(['needs-you.opened']);
  });
});

describe('Needs you triage resolving', () => {
  it('resolves the item when the session works again', async () => {
    await served.heartbeat({ seq: 1, status: 'question', question });
    await served.heartbeat({ seq: 2, status: 'working' });

    expect(await served.openNeedsYou()).toEqual([]);
    expect(served.needsYouItems.items).toMatchObject([
      { resolvedAt: expect.any(String) },
    ]);
    expect(served.publishedNeedsYouTypes()).toEqual([
      'needs-you.opened',
      'needs-you.resolved',
    ]);
  });

  it('opens a subagent’s question as its own item and resolves it on its own', async () => {
    await served.heartbeat({ seq: 1, status: 'question', question });
    await served.heartbeat({
      seq: 2,
      agentId: 'plan-1',
      status: 'question',
      question: { text: 'Which branch?' },
    });

    expect(await served.openNeedsYou()).toHaveLength(2);

    await served.heartbeat({ seq: 3, agentId: 'plan-1', status: 'working' });

    expect(await served.openNeedsYou()).toMatchObject([
      { agentId: null, question },
    ]);
  });

  it.each(['complete', 'failed'] as const)(
    'resolves the session’s own and its subagents’ items when the session ends as %s',
    async (status) => {
      await served.heartbeat({ seq: 1, status: 'question', question });
      await served.heartbeat({
        seq: 2,
        agentId: 'plan-1',
        status: 'question',
        question: { text: 'Which branch?' },
      });

      await served.heartbeat({ seq: 3, status });

      expect(await served.openNeedsYou()).toEqual([]);
      expect(served.publishedNeedsYouTypes()).toEqual([
        'needs-you.opened',
        'needs-you.opened',
        'needs-you.resolved',
        'needs-you.resolved',
      ]);
    },
  );

  it('opens a new item when the session asks again after being answered', async () => {
    await served.heartbeat({ seq: 1, status: 'question', question });
    await served.heartbeat({ seq: 2, status: 'working' });
    await served.heartbeat({ seq: 3, status: 'question', question });

    expect(await served.openNeedsYou()).toHaveLength(1);
    expect(served.needsYouItems.items).toHaveLength(2);
  });

  it('ignores a heartbeat older than the state it would replace', async () => {
    await served.heartbeat({ seq: 5, status: 'question', question });
    await served.heartbeat({ seq: 2, status: 'working' });

    expect(await served.openNeedsYou()).toHaveLength(1);
  });
});
