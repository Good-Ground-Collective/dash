import { describe, expect, it } from 'vitest';

import { StoredAgentSessions } from '#src/briefing/__tests__/support/stored-agent-sessions.ts';
import {
  BriefingWorld,
  briefedPersonId,
  otherPersonId,
} from '#src/briefing/__tests__/support/briefing-world.ts';
import { briefingSnapshotSchema } from '#src/briefing/contracts/briefing-snapshot.ts';
import { fixedNow } from '#src/objectives/__tests__/support/objectives-fixtures.ts';

const studioId = '20000000-0000-4000-8000-000000000001';
const quietBenchId = '20000000-0000-4000-8000-000000000002';
const reviewerId = '20000000-0000-4000-8000-000000000003';
const nobodyId = '00000000-0000-4000-8000-0000000000ff';
const strangerBenchId = '20000000-0000-4000-8000-000000000004';

class StockedWorld {
  static async build(): Promise<BriefingWorld> {
    const world = new BriefingWorld();
    await world.storeObjectives();
    await world.storeGithub();
    await world.addBench({ id: studioId, benchId: 'studio-mac' });
    await world.addBench({ id: quietBenchId, benchId: 'quiet-mac' });
    await world.addAgentAccount({ id: reviewerId, agentName: 'ci-reviewer' });
    await world.addBench({
      id: strangerBenchId,
      benchId: 'other-mac',
      ownerUserId: otherPersonId,
    });
    StockedWorld.report(world);
    return world;
  }

  private static report(world: BriefingWorld): void {
    world.sessions
      .add(
        StoredAgentSessions.state({
          reportedBy: studioId,
          sessionId: 'session-a',
          question: {
            text: 'Which database should the sync use?',
            options: [
              { label: 'Postgres', description: 'secret-option-description' },
            ],
          },
          status: 'question',
        }),
      )
      .add(
        StoredAgentSessions.state({
          reportedBy: studioId,
          sessionId: 'session-a',
          agentId: 'sub-1',
          updatedAt: '2026-11-26T11:45:00.000Z',
        }),
      )
      .add(
        StoredAgentSessions.state({
          reportedBy: reviewerId,
          sessionId: 'session-b',
          reporterName: 'ci-reviewer',
          benchId: null,
          status: 'error',
          error: { kind: 'tool', message: 'The test run exited with 1' },
          updatedAt: '2026-11-26T10:00:00.000Z',
        }),
      )
      .add(
        StoredAgentSessions.state({
          reportedBy: strangerBenchId,
          sessionId: 'session-c',
          reporterName: 'other-mac',
          summary: 'Somebody else’s work',
        }),
      )
      .add(
        StoredAgentSessions.state({
          reportedBy: quietBenchId,
          sessionId: 'session-d',
          updatedAt: '2026-11-24T11:00:00.000Z',
        }),
      );
  }
}

describe('SourcedBriefingSnapshot assembly', () => {
  it('assembles every section for the person, parsing against the schema', async () => {
    const world = await StockedWorld.build();

    const digest = await world
      .snapshot()
      .of({ userId: briefedPersonId, now: fixedNow, previousBriefingAt: null });

    expect(briefingSnapshotSchema.safeParse(digest).success).toBe(true);
    expect(digest.takenAt).toBe('2026-11-26T12:00:00.000Z');
    expect(
      digest.objectives
        .filter(({ kind }) => kind === 'initiative')
        .map(({ title }) => title),
    ).toEqual(['Launch', 'Billing', 'Docs']);
    expect(digest.github.reviewRequests.map(({ number }) => number)).toEqual([
      1,
    ]);
    expect(digest.github.myPullRequests.map(({ number }) => number)).toEqual([
      2,
    ]);
    expect(digest.github.failedRuns.map(({ runNumber }) => runNumber)).toEqual([
      9,
    ]);
    expect(digest.github.assignedIssues.map(({ number }) => number)).toEqual([
      5,
    ]);
    expect(
      digest.connections.map(({ source, accountLogin, truncated }) => ({
        source,
        accountLogin,
        truncated,
      })),
    ).toEqual([
      { source: 'objectives', accountLogin: 'acme', truncated: false },
      { source: 'github', accountLogin: 'acme', truncated: false },
    ]);
    expect(digest.counts).toEqual({
      objectives: 6,
      reviewRequests: 1,
      myPullRequests: 1,
      failedRuns: 1,
      assignedIssues: 1,
      agents: 2,
      benches: 2,
    });
  });
});

describe('SourcedBriefingSnapshot refs', () => {
  it('gives every item a unique ref and its URL where one exists', async () => {
    const world = await StockedWorld.build();

    const digest = await world
      .snapshot()
      .of({ userId: briefedPersonId, now: fixedNow, previousBriefingAt: null });

    const items = [
      ...digest.objectives,
      ...digest.github.reviewRequests,
      ...digest.github.myPullRequests,
      ...digest.github.failedRuns,
      ...digest.github.assignedIssues,
      ...digest.agents,
      ...digest.benches,
      ...digest.connections,
    ];
    const refs = items.map(({ ref }) => ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(digest.objectives.map(({ ref }) => ref)).toEqual([
      'o1',
      'o2',
      'o3',
      'o4',
      'o5',
      'o6',
    ]);
    expect(digest.objectives[1]?.initiativeRef).toBe('o1');
    expect(digest.github.failedRuns[0]).toMatchObject({
      ref: 'run1',
      url: 'https://github.com/acme/app/actions/runs/9',
    });
    expect(digest.github.myPullRequests[0]?.ref).toBe('pr1');
    expect(
      digest.objectives.every(({ url }) => url.startsWith('https://')),
    ).toBe(true);
  });
});

describe('SourcedBriefingSnapshot agents', () => {
  it('reads agents from the person’s service accounts and benches from their latest session', async () => {
    const world = await StockedWorld.build();

    const digest = await world
      .snapshot()
      .of({ userId: briefedPersonId, now: fixedNow, previousBriefingAt: null });

    expect(digest.agents).toEqual([
      {
        ref: 'ag1',
        agentName: 'studio-mac',
        harness: 'claude-code',
        benchId: 'studio-mac',
        status: 'question',
        summary: 'Fixing the flaky sync test',
        question: 'Which database should the sync use?',
        error: null,
        repository: 'acme/app',
        branch: 'fix-sync',
        subagents: 1,
        lastHeartbeatAt: '2026-11-26T11:45:00.000Z',
      },
      expect.objectContaining({
        ref: 'ag2',
        agentName: 'ci-reviewer',
        status: 'error',
        error: { kind: 'tool', message: 'The test run exited with 1' },
      }),
    ]);
    expect(digest.benches).toEqual([
      {
        ref: 'bn1',
        benchId: 'studio-mac',
        description: 'The studio-mac desk',
        lastHeartbeatAt: '2026-11-26T11:45:00.000Z',
      },
      {
        ref: 'bn2',
        benchId: 'quiet-mac',
        description: 'The quiet-mac desk',
        lastHeartbeatAt: null,
      },
    ]);
  });
});

describe('SourcedBriefingSnapshot secrets', () => {
  it('leaves out secrets and personal data', async () => {
    const world = await StockedWorld.build();

    const digest = await world
      .snapshot()
      .of({ userId: briefedPersonId, now: fixedNow, previousBriefingAt: null });

    const serialized = JSON.stringify(digest);
    for (const forbidden of [
      /dash_live_/,
      /dash_dev_/,
      /sealed/i,
      /svc-/,
      /service\.invalid/,
      /@/,
      /heartbeat:write/,
      /telemetry:write/,
      /secret-option-description/,
      /\/Users\/ada/,
      /sha\d/,
      /headSha/,
      /connectionId/,
      new RegExp(studioId),
      new RegExp('10000000-0000-4000-8000-000000000001'),
    ]) {
      expect(serialized).not.toMatch(forbidden);
    }
  });

  it('shows a person with nothing stored an empty snapshot', async () => {
    const world = await StockedWorld.build();

    const digest = await world
      .snapshot()
      .of({ userId: nobodyId, now: fixedNow, previousBriefingAt: null });

    expect(digest.objectives).toEqual([]);
    expect(digest.connections).toEqual([]);
    expect(digest.agents).toEqual([]);
    expect(digest.counts.agents).toBe(0);
  });
});

describe('SourcedBriefingSnapshot since the last briefing', () => {
  it('looks back 24 hours when the person has no earlier briefing', async () => {
    const world = await StockedWorld.build();

    const digest = await world
      .snapshot()
      .of({ userId: briefedPersonId, now: fixedNow, previousBriefingAt: null });

    expect(digest.sinceLastBriefing).toMatchObject({
      since: '2026-11-25T12:00:00.000Z',
      previousBriefingAt: null,
    });
  });

  it('starts at the previous briefing and carries closed objectives with refs', async () => {
    const world = await StockedWorld.build();
    const previousBriefingAt = new Date('2026-11-24T00:00:00.000Z');

    const digest = await world
      .snapshot()
      .of({ userId: briefedPersonId, now: fixedNow, previousBriefingAt });

    const { sinceLastBriefing } = digest;
    expect(sinceLastBriefing.previousBriefingAt).toBe(
      '2026-11-24T00:00:00.000Z',
    );
    expect(sinceLastBriefing.changes.map(({ title }) => title)).toEqual([
      'Archive',
      'Epic E1',
    ]);
    expect(sinceLastBriefing.changes.map(({ ref }) => ref)).toEqual([
      'ch1',
      'ch2',
    ]);
    expect(sinceLastBriefing.changes[1]).toMatchObject({
      change: 'started',
      ticketsClosed: 1,
      initiativeTitle: 'Launch',
    });
    expect(briefingSnapshotSchema.safeParse(digest).success).toBe(true);
  });
});
