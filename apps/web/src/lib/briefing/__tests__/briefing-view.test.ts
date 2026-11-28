import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LegacyBriefings,
  SampleBriefings,
} from '#lib/briefing/__tests__/support/sample-briefings.ts';
import {
  type BriefingState,
  BriefingView,
} from '#lib/briefing/briefing-view.ts';

const now = new Date('2026-11-27T12:00:00Z');

class Sample {
  static view(state: BriefingState): BriefingView {
    return new BriefingView({ state, now });
  }

  static loaded(overrides: Parameters<typeof SampleBriefings.briefings>[0]) {
    return Sample.view({
      status: 'loaded',
      briefings: SampleBriefings.briefings(overrides),
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BriefingView, a good briefing', () => {
  const view = Sample.loaded({});

  it('splits the briefing into an opening, actions and a closing', () => {
    expect(view.status).toBe('ready');
    expect(view.sections?.opening).toHaveLength(2);
    expect(view.sections?.actions).toHaveLength(1);
    expect(view.sections?.closing).toHaveLength(1);
    expect(view.paragraphs).toEqual([]);
  });

  it('keeps the segments of an action with their links', () => {
    expect(view.sections?.actions[0]?.map(({ href }) => href)).toEqual([
      null,
      'https://github.com/acme/api/pull/9',
      null,
    ]);
  });

  it('says when it was generated and how old its data is', () => {
    expect(view.generated).toBe('Generated 20 minutes ago');
    expect(view.snapshot).toEqual({
      text: 'Data from 21 minutes ago',
      stale: false,
    });
  });

  it('lists the sources that held something', () => {
    expect(view.sources).toEqual([
      '4 objectives',
      '1 review request',
      '2 failed runs',
      '3 agents',
      '1 bench',
    ]);
  });

  it('allows Regenerate with no note', () => {
    expect(view.canRegenerate).toBe(true);
    expect(view.note).toBeNull();
    expect(view.budgetNote).toBeNull();
  });
});

describe('BriefingView, a stale snapshot', () => {
  it('flags a snapshot older than three hours, and not one exactly three hours old', () => {
    const at = (hours: number) =>
      Sample.loaded({
        latest: SampleBriefings.run({
          snapshotAt: new Date(now.getTime() - hours * 3_600_000),
        }),
      }).snapshot?.stale;

    expect(at(3)).toBe(false);
    expect(at(3.01)).toBe(true);
  });
});

describe('BriefingView, a run that did not produce a briefing', () => {
  const latest = SampleBriefings.run();

  it('keeps the last good briefing and says the newer run failed', () => {
    const failed = SampleBriefings.run({
      id: '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0002',
      status: 'failed',
      finishedAt: new Date('2026-11-27T11:50:00Z'),
      sections: null,
      paragraphs: null,
      error: 'The writer timed out.',
    });
    const view = Sample.loaded({ latest, lastRun: failed });

    expect(view.sections?.actions).toHaveLength(1);
    expect(view.note).toBe(
      'The latest run failed 10 minutes ago, so this is the previous briefing. The writer timed out.',
    );
  });

  it('says a newer run was skipped over budget, and turns Regenerate off', () => {
    const skipped = SampleBriefings.run({
      status: 'skipped_over_budget',
      finishedAt: new Date('2026-11-27T11:50:00Z'),
      sections: null,
      paragraphs: null,
    });
    const view = Sample.loaded({
      latest,
      lastRun: skipped,
      budget: {
        month: '2026-11',
        spentUsd: 100,
        capUsd: 100,
        runs: 37,
        reached: true,
      },
    });

    expect(view.note).toContain('skipped 10 minutes ago');
    expect(view.canRegenerate).toBe(false);
    expect(view.budgetNote).toBe(
      'This month’s budget is reached, so Regenerate is off.',
    );
  });

  it('shows no note when the last run is the briefing on show', () => {
    expect(Sample.loaded({ latest, lastRun: latest }).note).toBeNull();
  });
});

describe('BriefingView, without a briefing', () => {
  it('offers Regenerate when configured but nothing has run', () => {
    const view = Sample.loaded({ latest: null, lastRun: null, history: [] });

    expect(view.status).toBe('empty');
    expect(view.message).toBe(
      'No briefing yet. Regenerate to write the first one.',
    );
    expect(view.canRegenerate).toBe(true);
    expect(view.generated).toBeNull();
  });

  it('says it is not set up and offers nothing when not configured', () => {
    const view = Sample.loaded({
      configured: false,
      latest: null,
      lastRun: null,
    });

    expect(view.status).toBe('unconfigured');
    expect(view.canRegenerate).toBe(false);
  });

  it('says Mission Control could not be read', () => {
    const view = Sample.view({ status: 'failed' });

    expect(view.status).toBe('failed');
    expect(view.message).toContain('isn’t available');
    expect(view.canRegenerate).toBe(false);
  });
});

describe('BriefingView, a run in progress', () => {
  it('passes on the run Mission Control reports', () => {
    const running = { runId: 'wf-1', startedAt: now };

    expect(Sample.loaded({ running }).running).toEqual(running);
  });
});

describe('BriefingView, a briefing written before sections', () => {
  const view = Sample.loaded({ latest: LegacyBriefings.run() });

  it('shows its paragraphs as they were written and has no sections', () => {
    expect(view.status).toBe('ready');
    expect(view.sections).toBeNull();
    expect(view.paragraphs).toHaveLength(1);
    expect(view.paragraphs[0]?.map(({ href }) => href)).toEqual([
      null,
      'https://github.com/acme/api/pull/9',
      null,
    ]);
  });
});
