import { sql } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { AgentRecordsDatabase } from '#src/agents/__tests__/support/agent-records-database.ts';

const databaseUrl = inject('databaseUrl');
let store: AgentRecordsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await AgentRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_agent_session_repository',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleAgentSessionRepository', () => {
  it('lists every row of a session that anything in it updated since, and leaves out quiet sessions', async () => {
    const database = AgentRecordsDatabase.required(store);
    const record = async (
      payload: Parameters<typeof AgentRecordsDatabase.record>[0],
    ) => database.heartbeats.record(AgentRecordsDatabase.record(payload));
    await record({ sessionId: 'active', seq: 1 });
    await record({ sessionId: 'active', seq: 2, agentId: 'plan-1' });
    await record({ sessionId: 'quiet', seq: 1 });
    await database.database.orm.execute(
      sql`update agent_session set updated_at = now() - interval '2 days' where session_id = 'quiet' or agent_id = ''`,
    );

    const listed = await database.sessions.listUpdatedSince({
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    expect(
      listed.map(({ sessionId, agentId }) => ({ sessionId, agentId })),
    ).toEqual([
      { sessionId: 'active', agentId: null },
      { sessionId: 'active', agentId: 'plan-1' },
    ]);
  });
});
