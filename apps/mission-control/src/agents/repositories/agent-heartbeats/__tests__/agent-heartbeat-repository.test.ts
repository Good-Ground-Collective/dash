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

import {
  AgentRecordsDatabase,
  reporterIds,
} from '#src/agents/__tests__/support/agent-records-database.ts';

const databaseUrl = inject('databaseUrl');
let store: AgentRecordsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await AgentRecordsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_agent_heartbeat_repository',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

describe.skipIf(databaseUrl === null)('DrizzleAgentHeartbeatRepository', () => {
  it('stores a (sessionId, seq) once and answers the stored row for a repeat', async () => {
    const { heartbeats } = AgentRecordsDatabase.required(store);

    const first = await heartbeats.record(
      AgentRecordsDatabase.record({ seq: 1, summary: 'First' }),
    );
    const repeat = await heartbeats.record(
      AgentRecordsDatabase.record({ seq: 1, summary: 'Second' }),
    );

    expect(first).toMatchObject({
      outcome: 'created',
      heartbeat: { seq: 1, summary: 'First', agentId: null },
      session: { highestSeq: 1, agentId: null },
    });
    expect(repeat).toEqual({
      outcome: 'duplicate',
      heartbeat: first.heartbeat,
      session: null,
    });
  });

  it('keeps the error, task, workspace, machine and agent a heartbeat carries', async () => {
    const { heartbeats } = AgentRecordsDatabase.required(store);
    const carried = {
      error: { kind: 'api', message: 'Overloaded' },
      taskId: 'task-42',
      workspace: { repository: 'Good-Ground-Collective/dash', branch: 'main' },
      machine: 'studio-mac.local',
      agent: { type: 'explore', model: 'claude-opus' },
    };

    const recorded = await heartbeats.record(
      AgentRecordsDatabase.record({ seq: 1, status: 'error', ...carried }),
    );

    expect(recorded).toMatchObject({
      heartbeat: { status: 'error', ...carried },
      session: { status: 'error', ...carried },
    });
  });
});

describe.skipIf(databaseUrl === null)(
  'DrizzleAgentHeartbeatRepository reporters',
  () => {
    it('gives a second key sending the same (sessionId, seq) its own row, and never shows or moves the first key’s', async () => {
      const { heartbeats, sessions } = AgentRecordsDatabase.required(store);
      const first = await heartbeats.record(
        AgentRecordsDatabase.record({
          seq: 1,
          status: 'question',
          summary: 'Private',
          question: { text: 'Ship?' },
        }),
      );
      const other = { reportedBy: reporterIds.other, benchId: 'other-mac' };

      const replay = await heartbeats.record(
        AgentRecordsDatabase.record({ seq: 1, status: 'working' }, other),
      );
      const ahead = await heartbeats.record(
        AgentRecordsDatabase.record(
          { seq: 9, status: 'complete' },
          { ...other, reporterName: 'squatter' },
        ),
      );
      const own = await heartbeats.record(
        AgentRecordsDatabase.record({ seq: 2, summary: 'Still mine' }),
      );

      expect(replay).toMatchObject({
        outcome: 'created',
        heartbeat: { benchId: 'other-mac', summary: null, question: null },
      });
      expect(replay.heartbeat.id).not.toBe(first.heartbeat.id);
      expect(ahead.outcome).toBe('created');
      expect(own).toMatchObject({
        outcome: 'created',
        session: { reportedBy: reporterIds.bench, highestSeq: 2 },
      });
      expect(await sessions.listUpdatedSince({ since: new Date(0) })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reportedBy: reporterIds.bench,
            reporterName: 'seth-laptop',
            benchId: 'studio-mac',
            status: 'working',
            summary: 'Still mine',
            highestSeq: 2,
          }),
          expect.objectContaining({
            reportedBy: reporterIds.other,
            reporterName: 'squatter',
            status: 'complete',
            highestSeq: 9,
          }),
        ]),
      );
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleAgentHeartbeatRepository session state',
  () => {
    it('keeps the highest seq’s state, and the last summary when a later heartbeat has none', async () => {
      const { heartbeats, sessions } = AgentRecordsDatabase.required(store);

      await heartbeats.record(
        AgentRecordsDatabase.record({ seq: 4, summary: 'Reading' }),
      );
      await heartbeats.record(
        AgentRecordsDatabase.record({
          seq: 6,
          status: 'question',
          question: { text: 'Ship?' },
        }),
      );
      const late = await heartbeats.record(
        AgentRecordsDatabase.record({ seq: 5, status: 'complete' }),
      );

      expect(late).toMatchObject({ outcome: 'created', session: null });
      expect(
        await sessions.listUpdatedSince({ since: new Date(0) }),
      ).toMatchObject([
        {
          status: 'question',
          summary: 'Reading',
          question: { text: 'Ship?' },
          highestSeq: 6,
        },
      ]);
    });

    it('never regresses under concurrent heartbeats', async () => {
      const { heartbeats, sessions } = AgentRecordsDatabase.required(store);
      const seqs = Array.from({ length: 30 }, (_, index) => (index * 7) % 30);

      await Promise.all(
        seqs.map(async (seq) =>
          heartbeats.record(AgentRecordsDatabase.record({ seq })),
        ),
      );

      expect(
        await sessions.listUpdatedSince({ since: new Date(0) }),
      ).toMatchObject([{ highestSeq: 29 }]);
    });

    it('keeps a subagent’s state in its own row under the session', async () => {
      const { heartbeats, sessions } = AgentRecordsDatabase.required(store);

      await heartbeats.record(AgentRecordsDatabase.record({ seq: 1 }));
      await heartbeats.record(
        AgentRecordsDatabase.record({
          seq: 2,
          agentId: 'explore-1',
          status: 'complete',
        }),
      );

      expect(
        await sessions.listUpdatedSince({ since: new Date(0) }),
      ).toMatchObject([
        { agentId: null, status: 'working', highestSeq: 1 },
        { agentId: 'explore-1', status: 'complete', highestSeq: 2 },
      ]);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleAgentHeartbeatRepository latest-known fields',
  () => {
    it('keeps the last task, workspace, machine and agent when a later heartbeat has none, and the error only from the latest', async () => {
      const { heartbeats, sessions } = AgentRecordsDatabase.required(store);
      const known = {
        taskId: 'task-42',
        workspace: { branch: 'main' },
        machine: 'studio-mac.local',
        agent: { model: 'claude-opus' },
      };

      await heartbeats.record(
        AgentRecordsDatabase.record({
          seq: 1,
          status: 'error',
          error: { kind: 'api', message: 'Overloaded' },
          ...known,
        }),
      );
      await heartbeats.record(AgentRecordsDatabase.record({ seq: 2 }));

      expect(
        await sessions.listUpdatedSince({ since: new Date(0) }),
      ).toMatchObject([{ status: 'working', error: null, ...known }]);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleAgentHeartbeatRepository retention',
  () => {
    it('deletes heartbeats received before the cutoff and keeps session state', async () => {
      const database = AgentRecordsDatabase.required(store);
      await database.heartbeats.record(AgentRecordsDatabase.record({ seq: 1 }));
      await database.heartbeats.record(AgentRecordsDatabase.record({ seq: 2 }));
      await database.database.orm.execute(
        sql`update agent_heartbeat set received_at = now() - interval '31 days' where seq = 1`,
      );

      const deleted = await database.heartbeats.deleteReceivedBefore({
        cutoff: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });

      expect(deleted).toBe(1);
      expect(
        await database.sessions.listUpdatedSince({ since: new Date(0) }),
      ).toMatchObject([{ highestSeq: 2 }]);
    });
  },
);
