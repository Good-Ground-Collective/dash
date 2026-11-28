import type { TrackerQuery } from '@dash/integrations-core';
import { describe, expect, it } from 'vitest';

import { TrackerGithub } from '#src/__tests__/support/tracker-github.ts';
import { TrackerNodes } from '#src/__tests__/support/tracker-nodes.ts';

const query: TrackerQuery = {
  installationId: '42',
  account: { login: 'acme', kind: 'organization' },
};

const github = TrackerGithub.withEpics([
  TrackerNodes.epicItem({
    number: 10,
    tickets: [
      TrackerNodes.ticket({
        number: 13,
        labels: ['P2', 'P1'],
        updatedAt: '2026-11-25T08:00:00Z',
        assignees: ['grace', 'ada'],
      }),
      TrackerNodes.ticket({
        number: 11,
        state: 'CLOSED',
        comment: '2026-11-23T10:00:00Z',
        mergedAt: '2026-11-21T09:00:00Z',
      }),
    ],
  }),
]);

describe('GithubTrackerRecords tickets', () => {
  it('keeps sub-issue order as each ticket’s position, with the highest label priority', async () => {
    const snapshot = await github.tracker().read(query);

    expect(snapshot.tickets).toEqual([
      expect.objectContaining({
        externalId: 'I_13',
        epicId: 'I_10',
        position: 0,
        priority: 'P1',
        state: 'open',
      }),
      expect.objectContaining({
        externalId: 'I_11',
        position: 1,
        priority: null,
        state: 'closed',
      }),
    ]);
  });

  it('keeps who each ticket is assigned to, none when unassigned', async () => {
    const snapshot = await github.tracker().read(query);

    expect(snapshot.tickets.map(({ assignees }) => assignees)).toEqual([
      ['grace', 'ada'],
      [],
    ]);
  });

  it('dates an epic by its most recently changed ticket', async () => {
    const snapshot = await github.tracker().read(query);

    expect(snapshot.epics[0]?.lastActivityAt).toBe('2026-11-25T08:00:00Z');
    expect(snapshot.initiatives[0]?.lastActivityAt).toBe(
      '2026-11-25T08:00:00Z',
    );
  });
});

describe('GithubTrackerRecords activity', () => {
  it('reports the closing, the newest merged pull request and the last comment on each ticket', async () => {
    const snapshot = await github.tracker().read(query);

    expect(snapshot.activity).toEqual([
      {
        ticketId: 'I_11',
        kind: 'ticket_closed',
        occurredAt: '2026-11-21T10:00:00Z',
        actor: null,
        url: 'https://github.com/acme/app/issues/11',
      },
      {
        ticketId: 'I_11',
        kind: 'pull_request_merged',
        occurredAt: '2026-11-21T09:00:00Z',
        actor: 'ada',
        url: 'https://github.com/acme/app/pull/91',
      },
      {
        ticketId: 'I_11',
        kind: 'commented',
        occurredAt: '2026-11-23T10:00:00Z',
        actor: 'grace',
        url: 'https://github.com/acme/app/issues/11#comment',
      },
    ]);
  });
});
