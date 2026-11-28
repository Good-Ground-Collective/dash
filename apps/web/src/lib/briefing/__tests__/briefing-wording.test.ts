import { describe, expect, it } from 'vitest';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { BriefingWording } from '#lib/briefing/briefing-wording.ts';

describe('BriefingWording.spend', () => {
  it('shows cents spent against a whole-dollar cap', () => {
    expect(
      BriefingWording.spend({
        month: '2026-11',
        spentUsd: 12.4,
        capUsd: 100,
        reached: false,
      }),
    ).toBe('$12.40 of $100 this month');
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
