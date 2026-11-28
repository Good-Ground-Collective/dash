import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BriefingEventReader } from '#lib/briefing/briefing-event-reader.ts';
import type { BriefingRunEvent } from '#lib/briefing/briefing-run.ts';
import { BrowserLiveEventStream } from '#lib/live/browser-live-event-stream.ts';
import { FakeEventSource } from '#lib/live/__tests__/support/fake-event-source.ts';

const briefingId = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0001';

class Followed {
  readonly events: BriefingRunEvent[] = [];

  constructor() {
    const stream = new BrowserLiveEventStream({
      baseUrl: 'https://api.example.test',
    });
    for (const definition of [
      BriefingEventReader.PROGRESS,
      BriefingEventReader.READY,
    ]) {
      stream.subscribe({
        definition,
        onEvent: (event) => this.events.push(event),
      });
    }
  }

  static send(frame: { type: string; data: string }): void {
    FakeEventSource.latest().send(frame);
  }
}

beforeEach(() => {
  FakeEventSource.INSTANCES = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BriefingEventReader', () => {
  it('reads a progress frame', () => {
    const followed = new Followed();

    Followed.send({
      type: 'briefing.progress',
      data: JSON.stringify({ runId: 'wf-1', stage: 'snapshot' }),
    });

    expect(followed.events).toEqual([
      { kind: 'progress', runId: 'wf-1', stage: 'snapshot' },
    ]);
  });

  it('reads a ready frame whatever the run’s status', () => {
    const followed = new Followed();

    Followed.send({
      type: 'briefing.ready',
      data: JSON.stringify({ runId: 'wf-1', briefingId, status: 'failed' }),
    });

    expect(followed.events).toEqual([
      { kind: 'ready', runId: 'wf-1', briefingId, status: 'failed' },
    ]);
  });

  it('drops frames that are not JSON, break the contract, or are another event', () => {
    const followed = new Followed();

    for (const frame of [
      { type: 'briefing.progress', data: 'not json' },
      {
        type: 'briefing.progress',
        data: JSON.stringify({ runId: 'wf-1', stage: 'dreaming' }),
      },
      { type: 'briefing.ready', data: '42' },
      { type: 'heartbeat.updated', data: '{}' },
    ]) {
      Followed.send(frame);
    }

    expect(followed.events).toEqual([]);
  });
});
