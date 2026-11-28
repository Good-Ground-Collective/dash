import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import {
  AgentRecordsDatabase,
  reporterIds,
} from '#src/agents/__tests__/support/agent-records-database.ts';

const databaseUrl = inject('databaseUrl');
let store: AgentRecordsDatabase | undefined;

const session = { reportedBy: reporterIds.bench, sessionId: 'session-1' };
const question = { text: 'Which database?' };
const kind = 'needs_input' as const;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await AgentRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_needs_you_item_repository',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleNeedsYouItemRepository', () => {
  it('holds at most one open item per session or subagent, and opens another once it resolves', async () => {
    const { needsYou } = AgentRecordsDatabase.required(store);

    const first = await needsYou.open({
      ...session,
      agentId: null,
      question,
      kind,
    });
    const repeat = await needsYou.open({
      ...session,
      agentId: null,
      question,
      kind,
    });
    const subagent = await needsYou.open({
      ...session,
      agentId: 'plan-1',
      question: null,
      kind,
    });
    await needsYou.resolveOne({ ...session, agentId: null });
    const reopened = await needsYou.open({
      ...session,
      agentId: null,
      question,
      kind,
    });

    expect(first).toMatchObject({ agentId: null, question, resolvedAt: null });
    expect(repeat).toBeNull();
    expect(subagent).toMatchObject({ agentId: 'plan-1', question: null });
    expect(reopened?.id).not.toBe(first?.id);
    expect(await needsYou.listOpen()).toHaveLength(2);
  });

  it('resolves one row without touching its subagents, or the whole session', async () => {
    const { needsYou } = AgentRecordsDatabase.required(store);
    await needsYou.open({ ...session, agentId: null, question, kind });
    await needsYou.open({ ...session, agentId: 'plan-1', question, kind });
    await needsYou.open({
      reportedBy: reporterIds.other,
      sessionId: 'session-1',
      agentId: null,
      question,
      kind,
    });

    const one = await needsYou.resolveOne({ ...session, agentId: null });
    const rest = await needsYou.resolveSession(session);
    const again = await needsYou.resolveSession(session);

    expect(one).toMatchObject([{ agentId: null }]);
    expect(one[0]?.resolvedAt).not.toBeNull();
    expect(rest).toMatchObject([{ agentId: 'plan-1' }]);
    expect(again).toEqual([]);
    expect(await needsYou.listOpen()).toMatchObject([
      { reportedBy: reporterIds.other },
    ]);
  });
});

describe.skipIf(databaseUrl === null)(
  'DrizzleNeedsYouItemRepository kind',
  () => {
    it('carries an item’s kind, and resolves only a session’s stopped_responding item on request', async () => {
      const { needsYou } = AgentRecordsDatabase.required(store);
      const asked = await needsYou.open({
        ...session,
        agentId: 'plan-1',
        question,
        kind,
      });
      const stopped = await needsYou.open({
        ...session,
        agentId: null,
        question: null,
        kind: 'stopped_responding',
      });

      const resolved = await needsYou.resolveStopped(session);

      expect(asked?.kind).toBe('needs_input');
      expect(stopped).toMatchObject({
        kind: 'stopped_responding',
        agentId: null,
        question: null,
      });
      expect(resolved).toMatchObject([{ id: stopped?.id }]);
      expect(await needsYou.listOpen()).toMatchObject([{ id: asked?.id }]);
    });

    it('lists open items newest first', async () => {
      const { needsYou } = AgentRecordsDatabase.required(store);
      await needsYou.open({ ...session, agentId: 'a', question, kind });
      await needsYou.open({ ...session, agentId: 'b', question, kind });

      const items = await needsYou.listOpen();

      expect(items.map((item) => item.agentId)).toEqual(['b', 'a']);
    });
  },
);
