import { describe, expect, it } from 'vitest';

import {
  BriefingFixtures,
  longTitle,
} from '#src/briefing/__tests__/support/briefing-fixtures.ts';
import {
  BriefingWorld,
  briefedPersonId,
} from '#src/briefing/__tests__/support/briefing-world.ts';
import { StoredAgentSessions } from '#src/briefing/__tests__/support/stored-agent-sessions.ts';
import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { fixedNow } from '#src/objectives/__tests__/support/objectives-fixtures.ts';

class Briefed {
  static async with(props: {
    tracker: { initiatives: number; epics: number };
    activity?: {
      reviewRequests?: number;
      quietPullRequests?: number;
      problemPullRequests?: number;
      failedRuns?: number;
      issues?: number;
    };
    agents?: number;
  }): Promise<BriefingSnapshotDigest> {
    const world = new BriefingWorld();
    await world.storeObjectives(
      BriefingFixtures.tracker({ ...props.tracker, title: longTitle }),
    );
    await world.storeGithub(
      BriefingFixtures.activity({
        reviewRequests: 0,
        quietPullRequests: 0,
        problemPullRequests: 0,
        failedRuns: 0,
        issues: 0,
        ...props.activity,
        title: longTitle,
      }),
    );
    for (let index = 0; index < (props.agents ?? 0); index += 1) {
      const id = `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      await world.addAgentAccount({ id, agentName: `agent-${index}` });
      world.sessions.add(
        StoredAgentSessions.state({
          reportedBy: id,
          sessionId: `session-${index}`,
          reporterName: `agent-${index}`,
          summary: longTitle,
          updatedAt: `2026-11-26T11:${String(index).padStart(2, '0')}:00.000Z`,
        }),
      );
    }
    return world.snapshot().of({ userId: briefedPersonId, now: fixedNow });
  }

  static size(digest: BriefingSnapshotDigest): number {
    return JSON.stringify(digest).length;
  }
}

describe('BriefingFit capping', () => {
  it('caps free text and keeps at most five epics under an initiative', async () => {
    const digest = await Briefed.with({
      tracker: { initiatives: 1, epics: 8 },
    });

    expect(digest.objectives).toHaveLength(6);
    expect(digest.counts.objectives).toBe(9);
    for (const { title } of digest.objectives) {
      expect(title).toHaveLength(briefingLimits.titleLength);
      expect(title.endsWith('…')).toBe(true);
    }
  });

  it('keeps ten initiatives and reports every one in the counts', async () => {
    const digest = await Briefed.with({
      tracker: { initiatives: 12, epics: 0 },
    });

    expect(digest.objectives).toHaveLength(10);
    expect(digest.counts.objectives).toBe(12);
  });
});

describe('BriefingFit trimming the lowest priority first', () => {
  it('drops assigned issues first, and only as many as it takes to fit', async () => {
    const digest = await Briefed.with({
      tracker: { initiatives: 10, epics: 2 },
      activity: { quietPullRequests: 5, problemPullRequests: 5, issues: 10 },
    });

    expect(Briefed.size(digest)).toBeLessThanOrEqual(
      briefingLimits.budgetCharacters,
    );
    expect(digest.github.assignedIssues.length).toBeGreaterThan(0);
    expect(digest.github.assignedIssues.length).toBeLessThan(10);
    expect(digest.github.myPullRequests).toHaveLength(10);
    expect(digest.objectives).toHaveLength(30);
    expect(digest.counts.assignedIssues).toBe(10);
  });

  it('drops pull requests without a problem before those with one, after the issues', async () => {
    const digest = await Briefed.with({
      tracker: { initiatives: 10, epics: 2 },
      activity: {
        reviewRequests: 4,
        quietPullRequests: 6,
        problemPullRequests: 4,
        failedRuns: 10,
        issues: 10,
      },
    });

    const kept = digest.github.myPullRequests;
    expect(Briefed.size(digest)).toBeLessThanOrEqual(
      briefingLimits.budgetCharacters,
    );
    expect(digest.github.assignedIssues).toEqual([]);
    expect(
      kept.filter(({ checks }) => checks?.state === 'failure'),
    ).toHaveLength(4);
    expect(kept.length).toBeGreaterThan(4);
    expect(kept.length).toBeLessThan(10);
    expect(digest.counts.myPullRequests).toBe(10);
    expect(digest.github.failedRuns).toHaveLength(10);
  });
});

describe('BriefingFit trimming deeper', () => {
  it('drops epics beyond the first two from the last initiative back', async () => {
    const digest = await Briefed.with({
      tracker: { initiatives: 10, epics: 5 },
    });

    const epicsOf = (initiativeRef: string) =>
      digest.objectives.filter(
        (objective) => objective.initiativeRef === initiativeRef,
      );
    const initiatives = digest.objectives.filter(
      ({ kind }) => kind === 'initiative',
    );
    expect(Briefed.size(digest)).toBeLessThanOrEqual(
      briefingLimits.budgetCharacters,
    );
    expect(initiatives).toHaveLength(10);
    expect(epicsOf(initiatives[0]?.ref ?? '')).toHaveLength(5);
    expect(epicsOf(initiatives[9]?.ref ?? '')).toHaveLength(2);
    expect(digest.counts.objectives).toBe(60);
  });

  it('drops agents once issues, quiet pull requests and extra epics are gone', async () => {
    const digest = await Briefed.with({
      tracker: { initiatives: 10, epics: 2 },
      activity: { problemPullRequests: 10, issues: 3 },
      agents: 10,
    });

    expect(Briefed.size(digest)).toBeLessThanOrEqual(
      briefingLimits.budgetCharacters,
    );
    expect(digest.github.assignedIssues).toEqual([]);
    expect(digest.objectives).toHaveLength(30);
    expect(digest.github.myPullRequests).toHaveLength(10);
    expect(digest.agents.length).toBeLessThan(10);
    expect(digest.agents[0]?.agentName).toBe('agent-9');
    expect(digest.counts.agents).toBe(10);
  });

  it('numbers the refs that are left without gaps', async () => {
    const digest = await Briefed.with({
      tracker: { initiatives: 10, epics: 2 },
      activity: { quietPullRequests: 5, problemPullRequests: 5, issues: 10 },
    });

    expect(digest.github.assignedIssues.map(({ ref }) => ref)).toEqual(
      digest.github.assignedIssues.map((_, index) => `is${index + 1}`),
    );
  });
});
