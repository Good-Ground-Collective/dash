import { describe, expect, it } from 'vitest';
import { BriefingEventReader } from '#lib/briefing/briefing-event-reader.ts';

const briefingId = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0001';

describe('BriefingEventReader', () => {
  it('listens for progress and ready', () => {
    expect(BriefingEventReader.TYPES).toEqual([
      'briefing.progress',
      'briefing.ready',
    ]);
  });

  it('reads a progress frame', () => {
    expect(
      BriefingEventReader.read({
        type: 'briefing.progress',
        data: JSON.stringify({ runId: 'wf-1', stage: 'snapshot' }),
      }),
    ).toEqual({ kind: 'progress', runId: 'wf-1', stage: 'snapshot' });
  });

  it('reads a ready frame whatever the run’s status', () => {
    expect(
      BriefingEventReader.read({
        type: 'briefing.ready',
        data: JSON.stringify({ runId: 'wf-1', briefingId, status: 'failed' }),
      }),
    ).toEqual({ kind: 'ready', runId: 'wf-1', briefingId, status: 'failed' });
  });

  it('drops frames that are not JSON, break the contract, or are another event', () => {
    const bad = [
      { type: 'briefing.progress', data: 'not json' },
      {
        type: 'briefing.progress',
        data: JSON.stringify({ runId: 'wf-1', stage: 'dreaming' }),
      },
      { type: 'briefing.ready', data: 42 },
      { type: 'heartbeat.updated', data: '{}' },
    ];

    expect(bad.map((frame) => BriefingEventReader.read(frame))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
