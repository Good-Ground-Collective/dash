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

    const first = await needsYou.open({ ...session, agentId: null, question });
    const repeat = await needsYou.open({ ...session, agentId: null, question });
    const subagent = await needsYou.open({
      ...session,
      agentId: 'plan-1',
      question: null,
    });
    await needsYou.resolveOne({ ...session, agentId: null });
    const reopened = await needsYou.open({
      ...session,
      agentId: null,
      question,
    });

    expect(first).toMatchObject({ agentId: null, question, resolvedAt: null });
    expect(repeat).toBeNull();
    expect(subagent).toMatchObject({ agentId: 'plan-1', question: null });
    expect(reopened?.id).not.toBe(first?.id);
    expect(await needsYou.listOpen()).toHaveLength(2);
  });

  it('resolves one row without touching its subagents, or the whole session', async () => {
    const { needsYou } = AgentRecordsDatabase.required(store);
    await needsYou.open({ ...session, agentId: null, question });
    await needsYou.open({ ...session, agentId: 'plan-1', question });
    await needsYou.open({
      reportedBy: reporterIds.other,
      sessionId: 'session-1',
      agentId: null,
      question,
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

  it('lists open items newest first', async () => {
    const { needsYou } = AgentRecordsDatabase.required(store);
    await needsYou.open({ ...session, agentId: 'a', question });
    await needsYou.open({ ...session, agentId: 'b', question });

    const items = await needsYou.listOpen();

    expect(items.map((item) => item.agentId)).toEqual(['b', 'a']);
  });
});
