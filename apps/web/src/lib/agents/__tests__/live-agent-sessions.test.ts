import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SampleAgentSessions } from '#lib/agents/__tests__/support/sample-agent-sessions.ts';
import type { AgentSession } from '#lib/agents/agent-session-contracts.ts';
import { LiveAgentSessions } from '#lib/agents/live-agent-sessions.ts';
import { FakeEventSource } from '#lib/live/__tests__/support/fake-event-source.ts';
import { BrowserLiveEventStream } from '#lib/live/browser-live-event-stream.ts';

const { session, subagent, update, wire } = SampleAgentSessions;

class Reads {
  calls = 0;
  answers: (AgentSession[] | Error | Promise<AgentSession[]>)[] = [];
  during: () => void = () => undefined;

  list = async (): Promise<AgentSession[]> => {
    this.calls += 1;
    this.during();
    const answer = this.answers.shift() ?? [];
    if (answer instanceof Error) throw answer;
    return answer;
  };
}

class Following {
  static async flush(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
  }

  static of(props: { initial: AgentSession[]; loaded?: boolean }) {
    const reads = new Reads();
    const feed = new LiveAgentSessions({
      initial: props.initial,
      loaded: props.loaded ?? true,
      stream: new BrowserLiveEventStream({
        baseUrl: 'https://api.example.test',
      }),
      reads,
    });
    return { feed, reads };
  }
}

class Frames {
  static send(state: Parameters<typeof wire>[0]): void {
    FakeEventSource.latest().send({
      type: 'agent.session.updated',
      data: wire(state),
    });
  }
}

beforeEach(() => {
  FakeEventSource.INSTANCES = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('LiveAgentSessions events', () => {
  it('starts with what the page rendered', () => {
    const { feed } = Following.of({ initial: [session('one')] });

    expect(feed.sessions.list.map((entry) => entry.sessionId)).toEqual(['one']);
    expect(feed.loaded).toBe(true);
  });

  it('adds a session, a subagent and a liveness change from agent.session.updated', () => {
    const { feed } = Following.of({ initial: [] });
    feed.start();

    Frames.send(update({ sessionId: 'one', agentId: null }));
    Frames.send(update({ sessionId: 'one', agentId: 'worker' }));
    Frames.send(
      update({
        sessionId: 'one',
        agentId: 'worker',
        activity: { status: 'complete', highestSeq: 2 },
      }),
    );
    Frames.send(
      update({
        sessionId: 'one',
        agentId: null,
        activity: { liveness: 'stale' },
      }),
    );

    const [held] = feed.sessions.list;
    expect(feed.sessions.list).toHaveLength(1);
    expect(held?.subagents.map((entry) => entry.status)).toEqual(['complete']);
    expect(held?.parent?.liveness).toBe('stale');
  });

  it('ignores an event that is not session state', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { feed } = Following.of({ initial: [session('one')] });
    feed.start();

    FakeEventSource.latest().send({
      type: 'agent.session.updated',
      data: '{"sessionId":"x"}',
    });

    expect(feed.sessions.list).toHaveLength(1);
  });
});

describe('LiveAgentSessions resync', () => {
  it('reads the sessions again when the connection opens and when it comes back', async () => {
    const { feed, reads } = Following.of({ initial: [session('stale-one')] });
    feed.start();
    reads.answers = [[session('fresh')], [session('fresh'), session('missed')]];

    FakeEventSource.latest().open();
    await Following.flush();
    expect(feed.sessions.list.map((entry) => entry.sessionId)).toEqual([
      'fresh',
    ]);

    FakeEventSource.latest().dropAndRetry();
    FakeEventSource.latest().open();
    await Following.flush();
    expect(feed.sessions.list.map((entry) => entry.sessionId)).toEqual([
      'fresh',
      'missed',
    ]);
    expect(reads.calls).toBe(2);
  });

  it('reads again when an event lands while the read is in flight', async () => {
    const { feed, reads } = Following.of({ initial: [] });
    feed.start();
    reads.answers = [
      [session('before')],
      [
        session('before'),
        session('sub-only', { parent: null, subagents: [subagent('a')] }),
      ],
    ];
    FakeEventSource.latest().open();
    Frames.send(update({ sessionId: 'during', agentId: null }));

    await Following.flush();

    expect(reads.calls).toBe(2);
    expect(feed.sessions.list).toHaveLength(2);
  });

  it('keeps what it has when a read fails, and is loaded once one succeeds', async () => {
    const { feed, reads } = Following.of({ initial: [], loaded: false });
    feed.start();
    reads.answers = [new Error('503'), [session('one')]];

    FakeEventSource.latest().open();
    await Following.flush();
    expect(feed.loaded).toBe(false);
    expect(feed.sessions.list).toEqual([]);

    FakeEventSource.latest().dropAndRetry();
    FakeEventSource.latest().open();
    await Following.flush();
    expect(feed.loaded).toBe(true);
    expect(feed.sessions.list).toHaveLength(1);
  });
});

describe('LiveAgentSessions overlapping and idle', () => {
  it('holds no events once a resync has settled, and an idle frame does not cost a re-read', async () => {
    const { feed, reads } = Following.of({ initial: [] });
    feed.start();
    reads.answers = [[session('first')], [session('second')]];
    FakeEventSource.latest().open();
    await Following.flush();
    expect(reads.calls).toBe(1);

    Frames.send(update({ sessionId: 'idle-1', agentId: null }));
    Frames.send(update({ sessionId: 'idle-2', agentId: null }));
    expect(feed.retainedEvents).toBe(0);
    FakeEventSource.latest().dropAndRetry();
    FakeEventSource.latest().open();
    await Following.flush();

    expect(reads.calls).toBe(2);
    expect(feed.retainedEvents).toBe(0);
    expect(feed.sessions.list.map((entry) => entry.sessionId)).toEqual([
      'second',
    ]);
  });

});

describe('LiveAgentSessions overlapping reads', () => {
  it('never lets an older read replace the answer of a newer one', async () => {
    const { feed, reads } = Following.of({ initial: [] });
    feed.start();
    let resolveOlder: (sessions: AgentSession[]) => void = () => undefined;
    reads.answers = [
      new Promise<AgentSession[]>((resolve) => {
        resolveOlder = resolve;
      }),
      [session('fresh'), session('missed')],
    ];
    FakeEventSource.latest().open();
    FakeEventSource.latest().dropAndRetry();
    FakeEventSource.latest().open();
    await Following.flush();

    resolveOlder([session('fresh')]);
    await Following.flush();

    expect(
      feed.sessions.list.map((entry) => entry.sessionId).toSorted(),
    ).toEqual(['fresh', 'missed']);
    expect(feed.retainedEvents).toBe(0);
  });

  it('adopts an older read when the newer one failed, so a failed first read does not leave it unloaded', async () => {
    const { feed, reads } = Following.of({ initial: [], loaded: false });
    feed.start();
    let resolveOlder: (sessions: AgentSession[]) => void = () => undefined;
    reads.answers = [
      new Promise<AgentSession[]>((resolve) => {
        resolveOlder = resolve;
      }),
      new Error('503'),
    ];
    FakeEventSource.latest().open();
    FakeEventSource.latest().dropAndRetry();
    FakeEventSource.latest().open();
    await Following.flush();
    expect(feed.loaded).toBe(false);

    resolveOlder([session('fresh')]);
    await Following.flush();

    expect(feed.loaded).toBe(true);
    expect(feed.sessions.list.map((entry) => entry.sessionId)).toEqual([
      'fresh',
    ]);
    expect(feed.retainedEvents).toBe(0);
  });
});

describe('LiveAgentSessions resync under constant change', () => {
  it('adopts the last snapshot with the events that landed during it when every read is interrupted', async () => {
    const { feed, reads } = Following.of({ initial: [] });
    feed.start();
    reads.answers = [[session('one')], [session('two')], [session('three')]];
    reads.during = () =>
      Frames.send(
        update({ sessionId: `during-${reads.calls}`, agentId: null }),
      );

    FakeEventSource.latest().open();
    await Following.flush();

    expect(reads.calls).toBe(3);
    expect(feed.loaded).toBe(true);
    expect(
      feed.sessions.list.map((entry) => entry.sessionId).toSorted(),
    ).toEqual(['during-3', 'three']);
  });
});

describe('LiveAgentSessions stopping', () => {
  it('stops following when stopped', () => {
    const { feed } = Following.of({ initial: [] });
    const stop = feed.start();
    const open = FakeEventSource.latest();

    stop();
    open.send({
      type: 'agent.session.updated',
      data: wire(update({ sessionId: 'one', agentId: null })),
    });

    expect(feed.sessions.list).toEqual([]);
    expect(open.readyState).toBe(FakeEventSource.CLOSED);
  });
});
