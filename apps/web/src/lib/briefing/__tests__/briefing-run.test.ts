import { describe, expect, it } from 'vitest';
import {
  BriefingRun,
  type BriefingRunEvent,
  type BriefingRunState,
} from '#lib/briefing/briefing-run.ts';

const runId = 'wf-1';
const briefingId = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0001';

class Events {
  static progress(id: string): BriefingRunEvent {
    return { kind: 'progress', runId: id, stage: 'writing' };
  }

  static ready(id: string): BriefingRunEvent {
    return { kind: 'ready', runId: id, briefingId, status: 'succeeded' };
  }
}

const requested: BriefingRunState = BriefingRun.requested(runId);

describe('BriefingRun.reconcile', () => {
  it('follows a run Mission Control reports, and idles otherwise', () => {
    expect(
      BriefingRun.busy(BriefingRun.reconcile({ runId, startedAt: new Date() })),
    ).toBe(true);
    expect(BriefingRun.reconcile(null)).toEqual({ phase: 'idle' });
  });
});

describe('BriefingRun.receive', () => {
  it('moves the requested run to the stage it reports', () => {
    const step = BriefingRun.receive({
      state: requested,
      event: Events.progress(runId),
    });

    expect(step).toEqual({
      state: { phase: 'running', runId, stage: 'writing' },
      refetch: false,
      finished: null,
    });
  });

  it('adopts a run it did not start while idle', () => {
    const step = BriefingRun.receive({
      state: BriefingRun.idle(),
      event: Events.progress('scheduled-run'),
    });

    expect(step.state).toEqual({
      phase: 'running',
      runId: 'scheduled-run',
      stage: 'writing',
    });
  });

  it('ignores events of another run while following one', () => {
    for (const event of [Events.progress('other'), Events.ready('other')]) {
      expect(BriefingRun.receive({ state: requested, event })).toEqual({
        state: requested,
        refetch: false,
        finished: null,
      });
    }
  });

  it('finishes on ready, re-reads, and reports how the run ended', () => {
    const step = BriefingRun.receive({
      state: requested,
      event: Events.ready(runId),
    });

    expect(step).toEqual({
      state: { phase: 'idle' },
      refetch: true,
      finished: 'succeeded',
    });
  });

  it('re-reads on a ready it was idle for, such as another tab’s run', () => {
    const step = BriefingRun.receive({
      state: BriefingRun.idle(),
      event: Events.ready('other-tab'),
    });

    expect(step.refetch).toBe(true);
  });
});
