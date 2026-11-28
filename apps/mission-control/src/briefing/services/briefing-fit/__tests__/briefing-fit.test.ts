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
import type { BriefingDraft } from '#src/briefing/contracts/briefing-draft.ts';
import type {
  BriefingChangeDraft,
  BriefingObjectiveDraft,
  BriefingSnapshotDigest,
} from '#src/briefing/contracts/briefing-snapshot.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingFit } from '#src/briefing/services/briefing-fit/briefing-fit.ts';
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
    return world
      .snapshot()
      .of({ userId: briefedPersonId, now: fixedNow, previousBriefingAt: null });
  }

  /** The digest's sections back as a draft whose changes since the last briefing are titled `change-1`, `change-2` and so on. */
  static drafted(props: {
    digest: BriefingSnapshotDigest;
    changes: number;
  }): BriefingDraft {
    const { digest } = props;
    const unreffed = <Item extends { ref: string }>(items: Item[]) =>
      items.map(({ ref: _ref, ...item }) => item);
    const objective = ({
      ref: _ref,
      initiativeRef: _initiativeRef,
      ...rest
    }: BriefingSnapshotDigest['objectives'][number]): BriefingObjectiveDraft =>
      rest;
    const change = (index: number): BriefingChangeDraft => ({
      kind: 'epic',
      change: 'progressed',
      title: `change-${index}`.padEnd(briefingLimits.titleLength, 'x'),
      url: 'https://github.com/acme/web/issues/12',
      initiativeTitle: null,
      status: 'active',
      progress: { source: 'tracker', done: 1, total: 4 },
      ticketsClosed: 1,
      pullRequestsMerged: 0,
    });
    return {
      sinceLastBriefing: {
        ...digest.sinceLastBriefing,
        changes: Array.from({ length: props.changes }, (_, index) =>
          change(index + 1),
        ),
      },
      initiatives: digest.objectives
        .filter(({ kind }) => kind === 'initiative')
        .map((initiative) => ({
          initiative: objective(initiative),
          epics: digest.objectives
            .filter(({ initiativeRef }) => initiativeRef === initiative.ref)
            .map(objective),
        })),
      reviewRequests: unreffed(digest.github.reviewRequests),
      myPullRequests: unreffed(digest.github.myPullRequests),
      failedRuns: unreffed(digest.github.failedRuns),
      assignedIssues: unreffed(digest.github.assignedIssues),
      agents: unreffed(digest.agents),
      benches: unreffed(digest.benches),
      connections: unreffed(digest.connections),
    };
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

describe('BriefingFit trimming the changes last', () => {
  const takenAt = '2026-11-27T09:00:00.000Z';

  it('keeps every change while any other droppable section has an item', async () => {
    const base = await Briefed.with({
      tracker: { initiatives: 10, epics: 2 },
      activity: { reviewRequests: 4, problemPullRequests: 4, failedRuns: 4 },
    });
    const draft = Briefed.drafted({ digest: base, changes: 2 });

    const digest = BriefingFit.digest({
      draft,
      takenAt,
      counts: base.counts,
    });

    expect(digest.objectives.length).toBeGreaterThan(0);
    expect(digest.sinceLastBriefing.changes).toHaveLength(2);
  });

  it('trims the changes from the tail only once everything else is gone', async () => {
    const base = await Briefed.with({
      tracker: { initiatives: 10, epics: 2 },
      activity: { reviewRequests: 4, problemPullRequests: 4, failedRuns: 4 },
    });
    const draft = Briefed.drafted({ digest: base, changes: 80 });

    const digest = BriefingFit.digest({
      draft,
      takenAt,
      counts: base.counts,
    });

    const { changes } = digest.sinceLastBriefing;
    expect(Briefed.size(digest)).toBeLessThanOrEqual(
      briefingLimits.budgetCharacters,
    );
    expect(digest.objectives).toEqual([]);
    expect(digest.github.reviewRequests).toEqual([]);
    expect(digest.github.myPullRequests).toEqual([]);
    expect(digest.github.failedRuns).toEqual([]);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.length).toBeLessThan(80);
    expect(
      changes.map(({ title }) => title.slice(0, 12).replace(/x+$/, '')),
    ).toEqual(changes.map((_, index) => `change-${index + 1}`));
    expect(changes.map(({ ref }) => ref)).toEqual(
      changes.map((_, index) => `ch${index + 1}`),
    );
    expect(digest.sinceLastBriefing.totals).toEqual(
      draft.sinceLastBriefing.totals,
    );
  });
});
