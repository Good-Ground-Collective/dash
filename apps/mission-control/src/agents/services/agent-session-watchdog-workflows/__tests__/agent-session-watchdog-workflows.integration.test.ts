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
import { DbosWatchdogFixture } from '#src/agents/__tests__/support/dbos-watchdog-fixture.ts';
import {
  agentSessionWatchdogScheduleName,
  retiredExampleScheduleName,
} from '#src/agents/services/agent-session-watchdog-workflows/agent-session-watchdog-workflows.ts';

const databaseUrl = inject('databaseUrl');
const fixture = new DbosWatchdogFixture({
  databaseUrl: databaseUrl ?? 'postgres://unused@127.0.0.1/unused',
  name: 'dash_test_agent_session_watchdog',
});

beforeAll(async () => {
  if (databaseUrl !== null) {
    await fixture.launch();
  }
});

beforeEach(async () => {
  if (databaseUrl !== null) {
    await fixture.begin();
  }
});

afterAll(async () => {
  await fixture.stop();
});

describe.skipIf(databaseUrl === null)('Agent session watchdog on DBOS', () => {
  it('keeps a working session live at 9 minutes, marks it stale at 10 and lost at 30', async () => {
    await fixture.hear({ sessionId: 'quiet', seq: 1 });

    await fixture.tick(9);
    expect(await fixture.liveness()).toEqual({ quiet: 'live' });
    await fixture.tick(10);
    expect(await fixture.liveness()).toEqual({ quiet: 'stale' });
    await fixture.tick(29);
    expect(await fixture.liveness()).toEqual({ quiet: 'stale' });
    await fixture.tick(30);

    expect(await fixture.liveness()).toEqual({ quiet: 'lost' });
    expect(fixture.published).toMatchObject([
      { type: 'agent.session.updated', data: { liveness: 'stale' } },
      { type: 'agent.session.updated', data: { liveness: 'lost' } },
      { type: 'needs-you.opened', data: { kind: 'stopped_responding' } },
    ]);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)(
  'Agent session watchdog Needs you',
  () => {
    it('resolves a lost session’s open items and opens one stopped_responding item', async () => {
      await fixture.hear({ sessionId: 'quiet', seq: 1 });
      const asked = await fixture.records.needsYou.open({
        reportedBy: reporterIds.bench,
        sessionId: 'quiet',
        agentId: 'plan-1',
        question: { text: 'Which?' },
        kind: 'needs_input',
      });

      await fixture.tick(31);

      const open = await fixture.records.needsYou.listOpen();
      expect(open).toMatchObject([
        { sessionId: 'quiet', agentId: null, kind: 'stopped_responding' },
      ]);
      expect(fixture.published).toMatchObject([
        { type: 'agent.session.updated', data: { liveness: 'lost' } },
        { type: 'needs-you.resolved', data: { id: asked?.id } },
        { type: 'needs-you.opened', data: { kind: 'stopped_responding' } },
      ]);
    }, 30_000);

    it('goes live again on the next heartbeat', async () => {
      await fixture.hear({ sessionId: 'quiet', seq: 1 });
      await fixture.tick(31);
      expect(await fixture.liveness()).toEqual({ quiet: 'lost' });

      await fixture.records.heartbeats.record(
        AgentRecordsDatabase.record({ sessionId: 'quiet', seq: 2 }),
      );

      expect(await fixture.liveness()).toEqual({ quiet: 'live' });
    }, 30_000);

    it('never marks a session that is waiting on an answer', async () => {
      await fixture.hear({ sessionId: 'asking', seq: 1, status: 'question' });

      await fixture.tick(120);

      expect(await fixture.liveness()).toEqual({ asking: 'live' });
      expect(fixture.published).toEqual([]);
    }, 30_000);

    it('deletes the retired example schedule on activation, and activates again once it is gone', async () => {
      expect(await fixture.scheduleNames()).not.toContain(
        retiredExampleScheduleName,
      );

      await fixture.activate();

      expect(await fixture.scheduleNames()).toEqual(
        expect.arrayContaining([agentSessionWatchdogScheduleName]),
      );
      expect(await fixture.scheduleNames()).not.toContain(
        retiredExampleScheduleName,
      );
    }, 30_000);
  },
);
