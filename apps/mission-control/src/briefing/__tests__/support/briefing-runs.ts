import type { NewBriefingRun } from '#src/briefing/repositories/briefings/briefing-repository.ts';
import { adaId } from '#src/objectives/__tests__/support/objectives-fixtures.ts';

/** Briefing runs with the fields a test cares about set and the rest plausible. */
export class BriefingRuns {
  static succeeded(overrides: Partial<NewBriefingRun> = {}): NewBriefingRun {
    const startedAt = overrides.startedAt ?? new Date('2026-11-26T11:00:00Z');
    return {
      userId: adaId,
      trigger: 'scheduled',
      status: 'succeeded',
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 5000),
      snapshotAt: startedAt,
      model: 'gpt-6-luna',
      tokens: { input: 1000, cachedInput: 200, output: 300, reasoning: 100 },
      costMicroUsd: 250_000,
      prices: {
        inputUsdPerMTok: 0.1,
        cachedInputUsdPerMTok: 0.01,
        outputUsdPerMTok: 0.5,
      },
      sourceCounts: {
        objectives: 3,
        reviewRequests: 1,
        myPullRequests: 2,
        failedRuns: 0,
        assignedIssues: 4,
        agents: 1,
        benches: 0,
      },
      paragraphs: [
        [
          { text: 'Review ', href: null },
          {
            text: 'the pull request',
            href: 'https://github.com/acme/app/pull/1',
          },
        ],
      ],
      unknownRefs: 0,
      error: null,
      ...overrides,
    };
  }

  static failed(overrides: Partial<NewBriefingRun> = {}): NewBriefingRun {
    return BriefingRuns.succeeded({
      status: 'failed',
      paragraphs: null,
      error: 'OpenAI answered 500',
      ...overrides,
    });
  }

  static skipped(overrides: Partial<NewBriefingRun> = {}): NewBriefingRun {
    return BriefingRuns.succeeded({
      status: 'skipped_over_budget',
      snapshotAt: null,
      model: null,
      tokens: { input: 0, cachedInput: 0, output: 0, reasoning: 0 },
      costMicroUsd: 0,
      prices: null,
      sourceCounts: null,
      paragraphs: null,
      error: 'The monthly budget is spent',
      ...overrides,
    });
  }
}
