import {
  type BriefingSnapshotDigest,
  briefingSnapshotSchema,
} from '#src/briefing/contracts/briefing-snapshot.ts';

export const objectiveUrl = 'https://github.com/orgs/acme/projects/1';
export const changeUrl = 'https://github.com/acme/web/issues/12';
export const pullRequestUrl = 'https://github.com/acme/web/pull/7';

/** A small snapshot with one objective, one pull request, and one connection that has no page of its own to link to. */
export class SampleSnapshot {
  static build(): BriefingSnapshotDigest {
    return briefingSnapshotSchema.parse({
      takenAt: '2026-11-27T09:00:00.000Z',
      sinceLastBriefing: {
        since: '2026-11-26T09:00:00.000Z',
        previousBriefingAt: '2026-11-26T09:00:00.000Z',
        totals: {
          initiativesClosed: 0,
          epicsClosed: 1,
          epicsStarted: 0,
          epicsProgressed: 0,
          ticketsClosed: 0,
          pullRequestsMerged: 0,
        },
        changes: [
          {
            ref: 'ch1',
            kind: 'epic',
            change: 'closed',
            title: 'Wire the card',
            url: changeUrl,
            initiativeTitle: 'Ship the briefing',
            status: 'done',
            progress: { source: 'tracker', done: 3, total: 3 },
            ticketsClosed: 0,
            pullRequestsMerged: 0,
          },
        ],
      },
      objectives: [SampleSnapshot.objective()],
      github: {
        reviewRequests: [],
        myPullRequests: [SampleSnapshot.pullRequest()],
        failedRuns: [],
        assignedIssues: [],
      },
      agents: [],
      benches: [],
      connections: [
        {
          ref: 'cn1',
          source: 'github',
          accountLogin: 'acme',
          lastSyncedAt: '2026-11-26T08:00:00.000Z',
          truncated: true,
          lastError: null,
        },
      ],
      counts: {
        objectives: 1,
        reviewRequests: 0,
        myPullRequests: 1,
        failedRuns: 0,
        assignedIssues: 0,
        agents: 0,
        benches: 0,
      },
    });
  }

  private static objective() {
    return {
      ref: 'o1',
      kind: 'initiative',
      title: 'Ship the briefing',
      url: objectiveUrl,
      status: 'active',
      priority: null,
      dueDate: '2026-12-01',
      progress: { source: 'tracker', done: 1, total: 4 },
      lastActivityAt: '2026-11-26T09:00:00.000Z',
      hints: [],
      dueAfterInitiative: false,
      latestUpdate: null,
      nextTicket: null,
      initiativeRef: null,
    };
  }

  private static pullRequest() {
    return {
      ref: 'pr1',
      url: pullRequestUrl,
      repository: 'acme/web',
      number: 7,
      title: 'Add the briefing card',
      author: 'seth',
      draft: false,
      reviewDecision: null,
      mergeable: 'mergeable',
      checks: null,
      updatedAt: '2026-11-26T10:00:00.000Z',
    };
  }
}
