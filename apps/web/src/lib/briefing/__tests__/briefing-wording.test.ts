import { describe, expect, it } from 'vitest';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { BriefingWording } from '#lib/briefing/briefing-wording.ts';

describe('BriefingWording.spendReadout', () => {
  const budget = {
    month: '2026-11',
    spentUsd: 0.42,
    capUsd: 100,
    runs: 37,
    reached: false,
  };

  it('shows cents spent against a whole-dollar cap with the run count', () => {
    expect(BriefingWording.spendReadout(budget)).toBe(
      'AI briefing: $0.42 of $100 this month · 37 runs',
    );
  });

  it('says a single run in the singular', () => {
    expect(BriefingWording.spendReadout({ ...budget, runs: 1 })).toContain(
      '· 1 run',
    );
  });

  it('does not round a fraction of a cent down to nothing', () => {
    expect(
      BriefingWording.spendReadout({ ...budget, spentUsd: 0.004 }),
    ).toContain('under $0.01 of $100');
  });

  it('shows no spend as $0.00', () => {
    expect(
      BriefingWording.spendReadout({ ...budget, spentUsd: 0, runs: 0 }),
    ).toBe('AI briefing: $0.00 of $100 this month · 0 runs');
  });
});

describe('BriefingWording.refusal', () => {
  const refused = (props: { status: number; code?: string }) =>
    BriefingWording.refusal(new MissionControlError({ path: 'x', ...props }));

  it('says the briefing is not set up when Mission Control says so', () => {
    expect(refused({ status: 409, code: 'BRIEFING_NOT_CONFIGURED' })).toContain(
      'isn’t set up',
    );
  });

  it('asks for a sign-in after a 401', () => {
    expect(refused({ status: 401 })).toContain('Sign in');
  });

  it('falls back to try again for anything else, including a network failure', () => {
    expect(refused({ status: 500 })).toContain('Try again');
    expect(BriefingWording.refusal(null)).toContain('Try again');
  });
});

describe('BriefingWording.sources', () => {
  it('is empty when nothing was read', () => {
    expect(
      BriefingWording.sources({
        objectives: 0,
        reviewRequests: 0,
        myPullRequests: 0,
        failedRuns: 0,
        assignedIssues: 0,
        agents: 0,
        benches: 0,
      }),
    ).toEqual([]);
  });
});
