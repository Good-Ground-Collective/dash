import { describe, expect, it } from 'vitest';
import { SampleAgentSessions } from '#lib/agents/__tests__/support/sample-agent-sessions.ts';
import { AgentSessions } from '#lib/agents/agent-sessions.ts';

const { session, subagent, update } = SampleAgentSessions;

describe('AgentSessions.applyUpdate for new rows', () => {
  it('adds a session the first time it reports', () => {
    const sessions = AgentSessions.of([]).applyUpdate(
      update({
        sessionId: 'new',
        agentId: null,
        activity: { summary: 'Starting' },
      }),
    );

    expect(sessions.list).toHaveLength(1);
    expect(sessions.list[0]?.parent?.summary).toBe('Starting');
    expect(sessions.list[0]?.reporterName).toBe('new-hooks');
  });

  it('updates a session’s own state and keeps its subagents', () => {
    const held = AgentSessions.of([
      session('one', { subagents: [subagent('worker')] }),
    ]);

    const next = held.applyUpdate(
      update({
        sessionId: 'one',
        agentId: null,
        activity: { status: 'complete', highestSeq: 2 },
      }),
    );

    expect(next.list[0]?.parent?.status).toBe('complete');
    expect(next.list[0]?.subagents.map((entry) => entry.agentId)).toEqual([
      'worker',
    ]);
  });

  it('files a subagent under its session instead of listing it on its own', () => {
    const held = AgentSessions.of([session('one')]);

    const next = held.applyUpdate(
      update({ sessionId: 'one', agentId: 'worker-1' }),
    );

    expect(next.list).toHaveLength(1);
    expect(next.list[0]?.subagents.map((entry) => entry.agentId)).toEqual([
      'worker-1',
    ]);
  });

  it('starts a session from a subagent that reports before its parent does', () => {
    const next = AgentSessions.of([]).applyUpdate(
      update({ sessionId: 'early', agentId: 'worker' }),
    );

    expect(next.list[0]?.parent).toBeNull();
    expect(next.list[0]?.subagents).toHaveLength(1);
  });
});

describe('AgentSessions.applyUpdate for held rows', () => {
  it('updates a subagent in place and adds a new one after the others', () => {
    const held = AgentSessions.of([
      session('one', { subagents: [subagent('a'), subagent('b')] }),
    ]);

    const updated = held
      .applyUpdate(
        update({
          sessionId: 'one',
          agentId: 'a',
          activity: { status: 'complete', highestSeq: 2 },
        }),
      )
      .applyUpdate(update({ sessionId: 'one', agentId: 'c' }));

    expect(
      updated.list[0]?.subagents.map((entry) => [entry.agentId, entry.status]),
    ).toEqual([
      ['a', 'complete'],
      ['b', 'working'],
      ['c', 'working'],
    ]);
  });

  it('moves a session to stale and back with the same sequence number', () => {
    const held = AgentSessions.of([session('one')]);

    const stale = held.applyUpdate(
      update({
        sessionId: 'one',
        agentId: null,
        activity: { liveness: 'stale' },
      }),
    );
    const lost = stale.applyUpdate(
      update({
        sessionId: 'one',
        agentId: null,
        activity: { liveness: 'lost' },
      }),
    );
    const live = lost.applyUpdate(
      update({ sessionId: 'one', agentId: null, activity: { highestSeq: 2 } }),
    );

    expect(stale.list[0]?.parent?.liveness).toBe('stale');
    expect(lost.list[0]?.parent?.liveness).toBe('lost');
    expect(live.list[0]?.parent?.liveness).toBe('live');
  });
});

describe('AgentSessions.applyUpdate for liveness ordering', () => {
  it('drops a stale row with the same sequence number but an older liveness change after a live one', () => {
    const held = AgentSessions.of([
      session('one', {
        parent: {
          liveness: 'live',
          livenessChangedAt: SampleAgentSessions.at(2),
        },
      }),
    ]);

    const next = held.applyUpdate(
      update({
        sessionId: 'one',
        agentId: null,
        activity: {
          liveness: 'stale',
          livenessChangedAt: SampleAgentSessions.at(5),
        },
      }),
    );

    expect(next).toBe(held);
    expect(next.list[0]?.parent?.liveness).toBe('live');
  });

  it('drops an older liveness change for a subagent too', () => {
    const held = AgentSessions.of([
      session('one', {
        subagents: [
          subagent('worker', {
            liveness: 'live',
            livenessChangedAt: SampleAgentSessions.at(2),
          }),
        ],
      }),
    ]);

    const next = held.applyUpdate(
      update({
        sessionId: 'one',
        agentId: 'worker',
        activity: {
          liveness: 'stale',
          livenessChangedAt: SampleAgentSessions.at(5),
        },
      }),
    );

    expect(next.list[0]?.subagents[0]?.liveness).toBe('live');
  });
});

describe('AgentSessions.applyUpdate for stale rows', () => {
  it('drops a row older than the one it holds', () => {
    const held = AgentSessions.of([
      session('one', {
        parent: { highestSeq: 5, summary: 'Newest' },
        subagents: [subagent('a', { highestSeq: 5 })],
      }),
    ]);

    const next = held
      .applyUpdate(
        update({
          sessionId: 'one',
          agentId: null,
          activity: { highestSeq: 4, summary: 'Old' },
        }),
      )
      .applyUpdate(
        update({ sessionId: 'one', agentId: 'a', activity: { highestSeq: 3 } }),
      );

    expect(next).toBe(held);
  });

  it('keeps two keys’ sessions with the same id apart', () => {
    const otherKey = {
      ...update({ sessionId: 'one', agentId: null }),
      reportedBy: '3f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099',
    };

    const next = AgentSessions.of([session('one')]).applyUpdate(otherKey);

    expect(next.list).toHaveLength(2);
  });
});

describe('AgentSessions.stats', () => {
  it('counts active sessions, ones that need you, and ones gone quiet', () => {
    const sessions = AgentSessions.of([
      session('working'),
      session('asking', { parent: { status: 'question' } }),
      session('subagent-asks', {
        subagents: [subagent('a', { question: { text: 'Which one?' } })],
      }),
      session('done', { parent: { status: 'complete' } }),
      session('stale', { parent: { liveness: 'stale' } }),
      session('lost', { parent: { liveness: 'lost' } }),
    ]);

    expect(sessions.stats()).toEqual({
      active: 3,
      needYou: 2,
      staleOrLost: 2,
    });
  });

  it('reads a session whose parent has not reported from its subagents', () => {
    const sessions = AgentSessions.of([
      session('early', {
        parent: null,
        subagents: [subagent('a', { liveness: 'lost' })],
      }),
    ]);

    expect(sessions.stats().staleOrLost).toBe(1);
    expect(sessions.stats().active).toBe(0);
  });
});
