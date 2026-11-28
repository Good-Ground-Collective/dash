import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserLiveEventStream } from '#lib/live/browser-live-event-stream.ts';
import { FakeEventSource } from '#lib/live/__tests__/support/fake-event-source.ts';
import { LiveNeedsYou } from '#lib/needs-you/live-needs-you.ts';
import type { NeedsYouItem } from '#lib/needs-you/needs-you-contracts.ts';
import type { NeedsYouSession } from '#lib/needs-you/needs-you-session-contracts.ts';
import { SampleNeedsYouItems } from '#lib/needs-you/__tests__/support/sample-needs-you-items.ts';

const first = SampleNeedsYouItems.open({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  openedAt: '2026-11-27T12:00:00.000Z',
});
const second = SampleNeedsYouItems.open({
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  openedAt: '2026-11-27T12:10:00.000Z',
});

const studio: NeedsYouSession = {
  reportedBy: first.reportedBy,
  sessionId: first.sessionId,
  reporterName: 'studio-mini',
  benchId: 'studio-mini',
  harness: 'claude-code',
  parent: { machine: 'studio-mini' },
};

class Wire {
  static frame(item: NeedsYouItem): string {
    return JSON.stringify({
      ...item,
      openedAt: item.openedAt.toISOString(),
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
    });
  }
}

class Reads {
  calls = 0;
  answers: NeedsYouItem[][] = [];
  sessionCalls = 0;
  sessions: NeedsYouSession[] = [];

  listOpen = async (): Promise<NeedsYouItem[]> => {
    this.calls += 1;
    return this.answers.shift() ?? [];
  };

  listSessions = async (): Promise<NeedsYouSession[]> => {
    this.sessionCalls += 1;
    return this.sessions;
  };
}

class Following {
  static async flush(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
  }

  static of(props: { initial: NeedsYouItem[]; sessions?: NeedsYouSession[] }) {
    const reads = new Reads();
    const feed = new LiveNeedsYou({
      initial: props.initial,
      sessions: props.sessions ?? [],
      stream: new BrowserLiveEventStream({
        baseUrl: 'https://api.example.test',
      }),
      reads,
    });
    return { feed, reads };
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

describe('LiveNeedsYou', () => {
  it('starts with what the page rendered', () => {
    const { feed } = Following.of({ initial: [first] });

    expect(feed.items).toEqual([first]);
    expect(feed.count).toBe(1);
  });

  it('adds an item when it opens and removes it when it resolves, with the count following', () => {
    const { feed } = Following.of({ initial: [] });
    feed.start();

    FakeEventSource.latest().send({
      type: 'needs-you.opened',
      data: Wire.frame(first),
    });
    FakeEventSource.latest().send({
      type: 'needs-you.opened',
      data: Wire.frame(second),
    });
    expect(feed.items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(feed.count).toBe(2);

    FakeEventSource.latest().send({
      type: 'needs-you.resolved',
      data: Wire.frame(SampleNeedsYouItems.resolved(second)),
    });
    expect(feed.items.map((item) => item.id)).toEqual([first.id]);
    expect(feed.count).toBe(1);
  });

  it('ignores an event that is not an item', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { feed } = Following.of({ initial: [first] });
    feed.start();

    FakeEventSource.latest().send({
      type: 'needs-you.opened',
      data: '{"id":"x"}',
    });
    FakeEventSource.latest().send({ type: 'needs-you.resolved', data: 'nope' });

    expect(feed.items).toEqual([first]);
  });

  it('stops following and closes the connection when stopped', () => {
    const { feed } = Following.of({ initial: [] });
    const stop = feed.start();
    const open = FakeEventSource.latest();

    stop();
    open.send({ type: 'needs-you.opened', data: Wire.frame(first) });

    expect(feed.count).toBe(0);
    expect(open.readyState).toBe(FakeEventSource.CLOSED);
  });
});

describe('LiveNeedsYou resync', () => {
  it('re-reads the open items when the connection opens and again when it reconnects', async () => {
    const { feed, reads } = Following.of({ initial: [] });
    feed.start();
    reads.answers = [[first], [first, second]];

    FakeEventSource.latest().open();
    await Following.flush();
    expect(feed.items).toEqual([first]);

    FakeEventSource.latest().dropAndRetry();
    FakeEventSource.latest().open();
    await Following.flush();
    expect(feed.items.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(reads.calls).toBe(2);
  });

  it('drops an item that resolved while the connection was down', async () => {
    const { feed, reads } = Following.of({ initial: [first] });
    feed.start();
    reads.answers = [[]];

    FakeEventSource.latest().open();
    await Following.flush();

    expect(feed.count).toBe(0);
  });

  it('keeps the list when the re-read fails', async () => {
    const { feed, reads } = Following.of({ initial: [first] });
    feed.start();
    reads.listOpen = vi.fn().mockRejectedValue(new Error('down'));

    FakeEventSource.latest().open();
    await Following.flush();

    expect(feed.items).toEqual([first]);
  });

  it('reads again when an event lands while the read is in flight', async () => {
    const { feed, reads } = Following.of({ initial: [first] });
    feed.start();
    let release: (items: NeedsYouItem[]) => void = () => undefined;
    const staleRead = new Promise<NeedsYouItem[]>((resolve) => {
      release = resolve;
    });
    reads.listOpen = async () => {
      reads.calls += 1;
      return reads.calls === 1 ? staleRead : [];
    };

    FakeEventSource.latest().open();
    FakeEventSource.latest().send({
      type: 'needs-you.resolved',
      data: Wire.frame(SampleNeedsYouItems.resolved(first)),
    });
    release([first]);
    await Following.flush();

    expect(feed.count).toBe(0);
    expect(reads.calls).toBe(2);
  });

  it('replaces the list when the server renders a new one', () => {
    const { feed } = Following.of({ initial: [first] });

    feed.reset({ items: [second], sessions: [studio] });

    expect(feed.items).toEqual([second]);
    expect(feed.where(first)).toBe('claude-code on studio-mini');
  });
});

describe('LiveNeedsYou sessions', () => {
  it('says where an item’s agent runs once its session is known', () => {
    const { feed } = Following.of({ initial: [first], sessions: [studio] });

    expect(feed.where(first)).toBe('claude-code on studio-mini');
  });

  it('says nothing when the item’s session is not known', () => {
    const { feed } = Following.of({ initial: [first] });

    expect(feed.where(first)).toBeNull();
  });

  it('reads the sessions when an item opens from one it does not know', async () => {
    const { feed, reads } = Following.of({ initial: [] });
    feed.start();
    reads.sessions = [studio];

    FakeEventSource.latest().send({
      type: 'needs-you.opened',
      data: Wire.frame(first),
    });
    await Following.flush();

    expect(feed.where(first)).toBe('claude-code on studio-mini');
    expect(reads.sessionCalls).toBe(1);
  });

  it('does not read the sessions again for an item from a known one', async () => {
    const { feed, reads } = Following.of({ initial: [], sessions: [studio] });
    feed.start();

    FakeEventSource.latest().send({
      type: 'needs-you.opened',
      data: Wire.frame(first),
    });
    await Following.flush();

    expect(reads.sessionCalls).toBe(0);
  });

  it('refreshes the sessions with the items when the connection opens, and keeps the old ones if that fails', async () => {
    const { feed, reads } = Following.of({ initial: [first] });
    feed.start();
    reads.answers = [[first]];
    reads.sessions = [studio];
    FakeEventSource.latest().open();
    await Following.flush();
    expect(feed.where(first)).toBe('claude-code on studio-mini');

    reads.answers = [[first]];
    reads.listSessions = vi.fn().mockRejectedValue(new Error('down'));
    FakeEventSource.latest().dropAndRetry();
    FakeEventSource.latest().open();
    await Following.flush();

    expect(feed.where(first)).toBe('claude-code on studio-mini');
  });
});
