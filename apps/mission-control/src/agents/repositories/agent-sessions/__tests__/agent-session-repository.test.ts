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

describe.skipIf(databaseUrl === null)(
  'DrizzleAgentSessionRepository silence',
  () => {
    it('marks only working rows silent past the cutoffs, and answers only the rows that changed', async () => {
      const database = AgentRecordsDatabase.required(store);
      const heardAgo = async (props: {
        payload: Parameters<typeof AgentRecordsDatabase.record>[0] & {
          sessionId: string;
        };
        minutes: number;
      }) => {
        await database.heartbeats.record(
          AgentRecordsDatabase.record(props.payload),
        );
        await database.heardAt({
          sessionId: props.payload.sessionId,
          at: new Date(Date.UTC(2026, 10, 27, 10) - props.minutes * 60_000),
        });
      };
      await heardAgo({ payload: { sessionId: 'recent', seq: 1 }, minutes: 9 });
      await heardAgo({ payload: { sessionId: 'quiet', seq: 1 }, minutes: 10 });
      await heardAgo({ payload: { sessionId: 'gone', seq: 1 }, minutes: 30 });
      await heardAgo({
        payload: { sessionId: 'asking', seq: 1, status: 'question' },
        minutes: 90,
      });
      const cutoffs = {
        staleBefore: new Date('2026-11-27T09:50:00Z'),
        lostBefore: new Date('2026-11-27T09:30:00Z'),
      };

      const first = await database.sessions.markSilent(cutoffs);
      const second = await database.sessions.markSilent(cutoffs);

      expect(
        first.map(({ sessionId, liveness }) => ({ sessionId, liveness })),
      ).toEqual(
        expect.arrayContaining([
          { sessionId: 'quiet', liveness: 'stale' },
          { sessionId: 'gone', liveness: 'lost' },
        ]),
      );
      expect(first).toHaveLength(2);
      expect(second).toEqual([]);
    });

    it('sets a marked row live again when its next heartbeat moves it forward', async () => {
      const database = AgentRecordsDatabase.required(store);
      await database.heartbeats.record(
        AgentRecordsDatabase.record({ sessionId: 'gone', seq: 1 }),
      );
      await database.sessions.markSilent({
        staleBefore: new Date(Date.now() + 60_000),
        lostBefore: new Date(Date.now() + 60_000),
      });

      await database.heartbeats.record(
        AgentRecordsDatabase.record({ sessionId: 'gone', seq: 2 }),
      );

      const states = await database.sessions.listUpdatedSince({
        since: new Date(0),
      });
      expect(states.map(({ liveness }) => liveness)).toEqual(['live']);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleAgentSessionRepository liveness change and parent liveness',
  () => {
    it('moves livenessChangedAt only when liveness changes', async () => {
      const database = AgentRecordsDatabase.required(store);
      const changedAt = async () => {
        const [state] = await database.sessions.listUpdatedSince({
          since: new Date(0),
        });
        return state?.livenessChangedAt ?? '';
      };
      await database.heartbeats.record(
        AgentRecordsDatabase.record({ sessionId: 'moving', seq: 1 }),
      );
      const first = await changedAt();

      await database.heartbeats.record(
        AgentRecordsDatabase.record({ sessionId: 'moving', seq: 2 }),
      );
      const stillLive = await changedAt();
      const [marked] = await database.sessions.markSilent({
        staleBefore: new Date(Date.now() + 60_000),
        lostBefore: new Date(Date.now() + 60_000),
      });
      await database.heartbeats.record(
        AgentRecordsDatabase.record({ sessionId: 'moving', seq: 3 }),
      );
      const live = await changedAt();

      expect(stillLive).toBe(first);
      expect(Date.parse(marked?.livenessChangedAt ?? '')).toBeGreaterThan(
        Date.parse(first),
      );
      expect(Date.parse(live)).toBeGreaterThan(
        Date.parse(marked?.livenessChangedAt ?? ''),
      );
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleAgentSessionRepository parent liveness',
  () => {
    it('leaves a session’s own row while a subagent was updated after staleBefore, and still marks the subagent', async () => {
      const database = AgentRecordsDatabase.required(store);
      await database.heartbeats.record(
        AgentRecordsDatabase.record({ sessionId: 'busy', seq: 1 }),
      );
      await database.heartbeats.record(
        AgentRecordsDatabase.record({
          sessionId: 'busy',
          seq: 2,
          agentId: 'plan-1',
        }),
      );
      await database.heartbeats.record(
        AgentRecordsDatabase.record({
          sessionId: 'busy',
          seq: 3,
          agentId: 'plan-2',
        }),
      );
      await database.database.orm.execute(
        sql`update agent_session set updated_at = '2026-11-27T09:00:00Z' where session_id = 'busy' and agent_id <> 'plan-2'`,
      );
      await database.database.orm.execute(
        sql`update agent_session set updated_at = '2026-11-27T09:55:00Z' where session_id = 'busy' and agent_id = 'plan-2'`,
      );
      const cutoffs = {
        staleBefore: new Date('2026-11-27T09:50:00Z'),
        lostBefore: new Date('2026-11-27T09:30:00Z'),
      };

      const marked = await database.sessions.markSilent(cutoffs);

      expect(
        marked.map(({ agentId, liveness }) => ({ agentId, liveness })),
      ).toEqual([{ agentId: 'plan-1', liveness: 'lost' }]);
    });

    it('marks a session’s own row once none of its subagents is fresh', async () => {
      const database = AgentRecordsDatabase.required(store);
      await database.heartbeats.record(
        AgentRecordsDatabase.record({ sessionId: 'idle', seq: 1 }),
      );
      await database.heartbeats.record(
        AgentRecordsDatabase.record({
          sessionId: 'idle',
          seq: 2,
          agentId: 'plan-1',
        }),
      );
      await database.heardAt({
        sessionId: 'idle',
        at: new Date('2026-11-27T09:00:00Z'),
      });

      const marked = await database.sessions.markSilent({
        staleBefore: new Date('2026-11-27T09:50:00Z'),
        lostBefore: new Date('2026-11-27T09:30:00Z'),
      });

      expect(marked.map(({ liveness }) => liveness)).toEqual(['lost', 'lost']);
    });
  },
);
