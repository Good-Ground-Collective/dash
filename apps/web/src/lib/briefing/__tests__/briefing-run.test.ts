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
  const running = { runId, startedAt: new Date() };

  it('follows a run Mission Control reports, and idles otherwise', () => {
    expect(BriefingRun.busy(BriefingRun.reconcile(running))).toBe(true);
    expect(BriefingRun.reconcile(null)).toEqual({ phase: 'idle' });
  });

  it('keeps the stage of the run it already follows', () => {
    const current: BriefingRunState = {
      phase: 'running',
      runId,
      stage: 'saving',
    };

    expect(BriefingRun.reconcile(running, { current })).toBe(current);
  });

  it('stays idle for a run it already saw end', () => {
    expect(BriefingRun.reconcile(running, { ended: new Set([runId]) })).toEqual(
      { phase: 'idle' },
    );
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

  it('stays idle on an unknown run and asks for a re-read instead', () => {
    const step = BriefingRun.receive({
      state: BriefingRun.idle(),
      event: Events.progress('someone-elses-run'),
    });

    expect(step).toEqual({
      state: { phase: 'idle' },
      refetch: true,
      finished: null,
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

  it('re-reads on a ready it was idle for without claiming the run', () => {
    const step = BriefingRun.receive({
      state: BriefingRun.idle(),
      event: Events.ready('other-tab'),
    });

    expect(step).toEqual({
      state: { phase: 'idle' },
      refetch: true,
      finished: null,
    });
  });
});

describe('BriefingRun.confirm', () => {
  it('applies the stage of a run the re-read confirmed', () => {
    expect(
      BriefingRun.confirm({ state: requested, event: Events.progress(runId) }),
    ).toEqual({ phase: 'running', runId, stage: 'writing' });
  });

  it('leaves another run, a later stage, or an idle card alone', () => {
    const running: BriefingRunState = {
      phase: 'running',
      runId,
      stage: 'saving',
    };
    const cases = [
      { state: requested, event: Events.progress('other') },
      { state: running, event: Events.progress(runId) },
      { state: BriefingRun.idle(), event: Events.progress(runId) },
    ];
    for (const { state, event } of cases) {
      expect(BriefingRun.confirm({ state, event })).toBe(state);
    }
  });
});
