import type { TicketActivity, TrackerSnapshot } from '@dash/integrations-core';
import { describe, expect, it } from 'vitest';

import { BriefingWorld } from '#src/briefing/__tests__/support/briefing-world.ts';
import { BriefingChangeSections } from '#src/briefing/services/briefing-change-sections/briefing-change-sections.ts';
import {
  adaId,
  fixedNow,
  ObjectivesFixtures,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { ObjectivesAssembly } from '#src/objectives/services/objectives-assembly/objectives-assembly.ts';

const { initiative, epic, ticket } = ObjectivesFixtures;
const since = new Date('2026-11-25T00:00:00.000Z');
const closedLate = '2026-11-26T08:00:00.000Z';

class ChangeWorld {
  static async since(tracker: TrackerSnapshot) {
    const world = await new BriefingWorld().storeObjectives(tracker);
    const connections = await world.objectives.recordsFor({
      connectedBy: adaId,
    });
    const objectives = ObjectivesAssembly.assemble({
      connections,
      overlays: new Map(),
      statuses: ['active', 'parked', 'done'],
      now: fixedNow,
    });
    return BriefingChangeSections.since({
      connections,
      objectives,
      since,
      previousBriefingAt: since,
    });
  }

  static activity(
    ticketId: string,
    kind: TicketActivity['kind'],
    occurredAt: string,
  ): TicketActivity {
    return {
      ticketId,
      kind,
      occurredAt,
      actor: null,
      url: `https://github.com/acme/app/issues/${ticketId}`,
    };
  }

  /** A closed initiative, a closed epic, a started epic, an epic in progress and an epic closed long ago. */
  static everyKindOfMove(): TrackerSnapshot {
    const { activity } = ChangeWorld;
    return {
      initiatives: [
        initiative({ externalId: 'PVT_launch', title: 'Launch' }),
        initiative({
          externalId: 'PVT_done',
          title: 'Archive',
          state: 'closed',
          lastActivityAt: closedLate,
        }),
      ],
      epics: [
        epic({ externalId: 'EP', title: 'Progressing' }),
        epic({ externalId: 'ES', title: 'Starting' }),
        epic({
          externalId: 'EC',
          title: 'Closing',
          state: 'closed',
          lastActivityAt: closedLate,
        }),
        epic({
          externalId: 'EO',
          title: 'Closed long ago',
          state: 'closed',
          lastActivityAt: '2026-11-01T09:00:00.000Z',
        }),
      ],
      tickets: [
        ticket({
          externalId: 'P1',
          epicId: 'EP',
          position: 0,
          state: 'closed',
        }),
        ticket({
          externalId: 'P2',
          epicId: 'EP',
          position: 1,
          state: 'closed',
        }),
        ticket({ externalId: 'P3', epicId: 'EP', position: 2 }),
        ticket({
          externalId: 'S1',
          epicId: 'ES',
          position: 0,
          state: 'closed',
        }),
        ticket({ externalId: 'S2', epicId: 'ES', position: 1 }),
      ],
      activity: [
        activity('P1', 'ticket_closed', '2026-11-20T08:00:00.000Z'),
        activity('P2', 'ticket_closed', closedLate),
        activity('P2', 'pull_request_merged', closedLate),
        activity('S1', 'ticket_closed', closedLate),
      ],
      truncated: false,
    };
  }

  /** One epic whose single ticket was closed, reopened and closed again, and merged two pull requests. */
  static repeatedEvents(): TrackerSnapshot {
    const { activity } = ChangeWorld;
    return {
      initiatives: [initiative({ externalId: 'PVT_launch', title: 'Launch' })],
      epics: [epic({ externalId: 'E1', title: 'Steady work' })],
      tickets: [
        ticket({ externalId: 'A', epicId: 'E1', position: 0, state: 'closed' }),
        ticket({ externalId: 'B', epicId: 'E1', position: 1 }),
      ],
      activity: [
        activity('A', 'ticket_closed', '2026-11-25T08:00:00.000Z'),
        activity('A', 'ticket_closed', closedLate),
        activity('A', 'pull_request_merged', '2026-11-25T09:00:00.000Z'),
        activity('A', 'pull_request_merged', closedLate),
      ],
      truncated: false,
    };
  }

  /** One epic that merged a few tickets and nothing else. */
  static routineMerges(): TrackerSnapshot {
    const { activity } = ChangeWorld;
    return {
      initiatives: [initiative({ externalId: 'PVT_launch', title: 'Launch' })],
      epics: [epic({ externalId: 'E1', title: 'Steady work' })],
      tickets: [
        ticket({ externalId: 'A', epicId: 'E1', position: 0, state: 'closed' }),
        ticket({ externalId: 'B', epicId: 'E1', position: 1, state: 'closed' }),
        ticket({ externalId: 'C', epicId: 'E1', position: 2, state: 'closed' }),
        ticket({ externalId: 'D', epicId: 'E1', position: 3 }),
      ],
      activity: [
        activity('A', 'ticket_closed', '2026-11-10T08:00:00.000Z'),
        activity('B', 'ticket_closed', closedLate),
        activity('C', 'ticket_closed', closedLate),
        activity('C', 'pull_request_merged', closedLate),
      ],
      truncated: false,
    };
  }
}

describe('BriefingChangeSections substance', () => {
  it('puts a closed initiative before a closed epic, a started epic and progress', async () => {
    const changes = await ChangeWorld.since(ChangeWorld.everyKindOfMove());

    expect(
      changes.changes.map(({ kind, change, title }) => [kind, change, title]),
    ).toEqual([
      ['initiative', 'closed', 'Archive'],
      ['epic', 'closed', 'Closing'],
      ['epic', 'started', 'Starting'],
      ['epic', 'progressed', 'Progressing'],
    ]);
    expect(changes.changes[3]).toMatchObject({
      ticketsClosed: 1,
      pullRequestsMerged: 1,
      initiativeTitle: 'Launch',
    });
  });

  it('totals what moved and the window it moved in', async () => {
    const changes = await ChangeWorld.since(ChangeWorld.everyKindOfMove());

    expect(changes.totals).toEqual({
      initiativesClosed: 1,
      epicsClosed: 1,
      epicsStarted: 1,
      epicsProgressed: 1,
      ticketsClosed: 2,
      pullRequestsMerged: 1,
    });
    expect(changes.since).toBe('2026-11-25T00:00:00.000Z');
  });
});

describe('BriefingChangeSections routine work', () => {
  it('reports routine merges as counts when nothing closed or started', async () => {
    const changes = await ChangeWorld.since(ChangeWorld.routineMerges());

    expect(changes.changes.map(({ change }) => change)).toEqual(['progressed']);
    expect(changes.totals).toMatchObject({
      initiativesClosed: 0,
      epicsClosed: 0,
      epicsStarted: 0,
      epicsProgressed: 1,
      ticketsClosed: 2,
      pullRequestsMerged: 1,
    });
  });

  it('counts a ticket once however many times it closed or merged', async () => {
    const changes = await ChangeWorld.since(ChangeWorld.repeatedEvents());

    expect(changes.totals).toMatchObject({
      ticketsClosed: 1,
      pullRequestsMerged: 1,
    });
    expect(changes.changes[0]).toMatchObject({
      ticketsClosed: 1,
      pullRequestsMerged: 1,
    });
  });

  it('leaves out tickets closed before the window', async () => {
    const changes = await ChangeWorld.since(ObjectivesFixtures.snapshot());

    expect(changes.changes.map(({ title }) => title)).toEqual(['Archive']);
    expect(changes.totals.ticketsClosed).toBe(0);
  });
});
