import type {
  BriefingRecord,
  Briefings,
} from '#lib/api/briefings/briefing-contracts.ts';

/** Briefings as Mission Control sends them, with only what a test cares about spelled out. */
export class SampleBriefings {
  static run(overrides: Partial<BriefingRecord> = {}): BriefingRecord {
    return {
      id: '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0001',
      trigger: 'scheduled',
      status: 'succeeded',
      startedAt: new Date('2026-11-27T11:39:00Z'),
      finishedAt: new Date('2026-11-27T11:40:00Z'),
      snapshotAt: new Date('2026-11-27T11:39:00Z'),
      model: 'writer',
      tokens: { input: 100, cachedInput: 0, output: 50, reasoning: 0 },
      costUsd: 0.2,
      prices: null,
      sourceCounts: {
        objectives: 4,
        reviewRequests: 1,
        myPullRequests: 0,
        failedRuns: 2,
        assignedIssues: 0,
        agents: 3,
        benches: 1,
      },
      sections: {
        opening: [
          {
            text: 'Two initiatives closed since the last briefing, and work continues on billing. ',
            href: null,
          },
          { text: 'The console epic started.', href: null },
        ],
        actions: [
          [
            { text: 'Review ', href: null },
            {
              text: 'the passkey PR',
              href: 'https://github.com/acme/api/pull/9',
            },
            { text: ' first.', href: null },
          ],
        ],
        closing: [
          {
            text: 'At this rate the console epic should reach verification by the next update. The pace on billing is too thin to call.',
            href: null,
          },
        ],
      },
      paragraphs: null,
      unknownRefs: 0,
      error: null,
      ...overrides,
    };
  }

  static briefings(overrides: Partial<Briefings> = {}): Briefings {
    const latest = SampleBriefings.run();
    return {
      configured: true,
      latest,
      lastRun: latest,
      history: [latest],
      budget: {
        month: '2026-11',
        spentUsd: 12.4,
        capUsd: 100,
        runs: 37,
        reached: false,
      },
      running: null,
      ...overrides,
    };
  }
}

/** A run written before briefings had sections. */
export class LegacyBriefings {
  static run(overrides: Partial<BriefingRecord> = {}): BriefingRecord {
    return SampleBriefings.run({
      sections: null,
      paragraphs: [
        [
          { text: 'Review ', href: null },
          {
            text: 'the passkey PR',
            href: 'https://github.com/acme/api/pull/9',
          },
          { text: ' first.', href: null },
        ],
      ],
      ...overrides,
    });
  }
}
