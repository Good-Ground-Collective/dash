import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BrowserLiveEventStream } from '#lib/live/browser-live-event-stream.ts';
import type { LiveEventDefinition } from '#lib/live/live-event-stream.ts';
import { FakeEventSource } from '#lib/live/__tests__/support/fake-event-source.ts';

const ping: LiveEventDefinition<{ n: number }> = {
  name: 'ping',
  schema: z.object({ n: z.number() }),
};

const pong: LiveEventDefinition<{ word: string }> = {
  name: 'pong',
  schema: z.object({ word: z.string() }),
};

class Streams {
  static create(): BrowserLiveEventStream {
    return new BrowserLiveEventStream({
      baseUrl: 'https://api.example.test',
      reconnectDelayMs: 1000,
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
  vi.restoreAllMocks();
});

describe('BrowserLiveEventStream', () => {
  it('opens Mission Control’s events with credentials on the first subscriber only', () => {
    const live = Streams.create();
    expect(FakeEventSource.INSTANCES).toHaveLength(0);

    live.subscribe({ definition: ping, onEvent: () => undefined });
    live.subscribe({ definition: pong, onEvent: () => undefined });

    expect(FakeEventSource.INSTANCES).toHaveLength(1);
    expect(FakeEventSource.latest().url).toBe(
      'https://api.example.test/events',
    );
    expect(FakeEventSource.latest().withCredentials).toBe(true);
  });

  it('delivers each event to the subscribers of its name, validated', () => {
    const live = Streams.create();
    const pings: { n: number }[] = [];
    const pongs: { word: string }[] = [];
    live.subscribe({ definition: ping, onEvent: (event) => pings.push(event) });
    live.subscribe({ definition: ping, onEvent: (event) => pings.push(event) });
    live.subscribe({ definition: pong, onEvent: (event) => pongs.push(event) });

    FakeEventSource.latest().send({ type: 'ping', data: '{"n":1}' });
    FakeEventSource.latest().send({ type: 'pong', data: '{"word":"hi"}' });

    expect(pings).toEqual([{ n: 1 }, { n: 1 }]);
    expect(pongs).toEqual([{ word: 'hi' }]);
  });

  it('drops frames that are not JSON or break the contract', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const live = Streams.create();
    const received: unknown[] = [];
    live.subscribe({ definition: ping, onEvent: (e) => received.push(e) });

    FakeEventSource.latest().send({ type: 'ping', data: 'nope' });
    FakeEventSource.latest().send({ type: 'ping', data: '{"n":"one"}' });
    FakeEventSource.latest().send({ type: 'ping', data: '{"n":2}' });

    expect(received).toEqual([{ n: 2 }]);
  });

  it('stops delivering after the disposer runs and closes with the last subscriber', () => {
    const live = Streams.create();
    const received: unknown[] = [];
    const stopPing = live.subscribe({
      definition: ping,
      onEvent: (event) => received.push(event),
    });
    const stopPong = live.subscribe({
      definition: pong,
      onEvent: () => undefined,
    });
    const connection = FakeEventSource.latest();

    stopPing();
    connection.send({ type: 'ping', data: '{"n":1}' });
    expect(received).toEqual([]);
    expect(connection.readyState).toBe(FakeEventSource.CONNECTING);

    stopPong();
    expect(connection.readyState).toBe(FakeEventSource.CLOSED);
  });

  it('opens a fresh connection for a subscriber that arrives after all left', () => {
    const live = Streams.create();
    live.subscribe({ definition: ping, onEvent: () => undefined })();

    live.subscribe({ definition: ping, onEvent: () => undefined });

    expect(FakeEventSource.INSTANCES).toHaveLength(2);
  });
});

describe('BrowserLiveEventStream opening and reconnecting', () => {
  it('reports the first open as not a reconnect and a later one as a reconnect', () => {
    const live = Streams.create();
    const opens: boolean[] = [];
    live.subscribe({
      definition: ping,
      onEvent: () => undefined,
      onOpen: ({ reconnected }) => opens.push(reconnected),
    });

    FakeEventSource.latest().open();
    FakeEventSource.latest().dropAndRetry();
    FakeEventSource.latest().open();

    expect(opens).toEqual([false, true]);
  });

  it('tells a subscriber that joins an open connection it is open', () => {
    const live = Streams.create();
    live.subscribe({ definition: ping, onEvent: () => undefined });
    FakeEventSource.latest().open();
    const opens: boolean[] = [];

    live.subscribe({
      definition: pong,
      onEvent: () => undefined,
      onOpen: ({ reconnected }) => opens.push(reconnected),
    });

    expect(opens).toEqual([false]);
  });

  it('reopens a connection the browser closed, once, and keeps delivering', () => {
    const live = Streams.create();
    const opens: boolean[] = [];
    const received: unknown[] = [];
    live.subscribe({
      definition: ping,
      onEvent: (event) => received.push(event),
      onOpen: ({ reconnected }) => opens.push(reconnected),
    });
    FakeEventSource.latest().open();

    FakeEventSource.latest().refuse();
    expect(FakeEventSource.INSTANCES).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.INSTANCES).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.INSTANCES).toHaveLength(2);

    FakeEventSource.latest().open();
    FakeEventSource.latest().send({ type: 'ping', data: '{"n":3}' });

    expect(opens).toEqual([false, true]);
    expect(received).toEqual([{ n: 3 }]);
  });
});

describe('BrowserLiveEventStream backoff', () => {
  it('waits twice as long after each failed reopen, up to a minute, and starts over once open', () => {
    const live = new BrowserLiveEventStream({
      baseUrl: 'https://api.example.test',
      reconnectDelayMs: 20_000,
    });
    live.subscribe({ definition: ping, onEvent: () => undefined });
    const reopenAfter = (milliseconds: number): void => {
      const before = FakeEventSource.INSTANCES.length;
      FakeEventSource.latest().refuse();
      vi.advanceTimersByTime(milliseconds - 1);
      expect(FakeEventSource.INSTANCES).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(FakeEventSource.INSTANCES).toHaveLength(before + 1);
    };

    reopenAfter(20_000);
    reopenAfter(40_000);
    reopenAfter(60_000);
    reopenAfter(60_000);
    FakeEventSource.latest().open();
    reopenAfter(20_000);
  });

  it('does not reopen after the last subscriber left during the wait', () => {
    const live = Streams.create();
    const stop = live.subscribe({ definition: ping, onEvent: () => undefined });
    FakeEventSource.latest().refuse();

    stop();
    vi.advanceTimersByTime(5000);

    expect(FakeEventSource.INSTANCES).toHaveLength(1);
  });
});
