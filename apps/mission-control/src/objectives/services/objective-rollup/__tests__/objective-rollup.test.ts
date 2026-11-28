import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fixedNow,
  ObjectivesFixtures,
  ownedId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import type { Overlay } from '#src/objectives/contracts/objectives.ts';
import type { ConnectionObjectives } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import { ObjectiveRollup } from '#src/objectives/services/objective-rollup/objective-rollup.ts';
import { TrackerRecords } from '#src/objectives/services/tracker-records/tracker-records.ts';

const connection: ConnectionObjectives = {
  connectionId: ownedId,
  accountLogin: 'acme',
  lastSyncedAt: fixedNow.toISOString(),
  lastError: null,
  truncated: false,
  records: TrackerRecords.from(ObjectivesFixtures.snapshot()),
};

class Rolled {
  static initiative(
    id: string,
    overlays: ReadonlyMap<string, Overlay> = new Map(),
  ) {
    return ObjectiveRollup.initiatives({
      connection,
      overlays,
      now: new Date(),
    }).find((initiative) => initiative.id === id);
  }

  static epic(id: string, overlays?: ReadonlyMap<string, Overlay>) {
    return Rolled.initiative('PVT_launch', overlays)?.epics.find(
      (epic) => epic.id === id,
    );
  }

  /** Epic E2 with 30 tickets, the last two open. */
  static crowdedEpic() {
    const [template] = connection.records.tickets;
    const crowded: ConnectionObjectives = {
      ...connection,
      records: {
        ...connection.records,
        tickets: Array.from({ length: 30 }, (_, position) => ({
          ...template!,
          nodeId: `X${position}`,
          url: `https://github.com/acme/app/issues/X${String(position)}`,
          epicNodeId: 'E2',
          position,
          state: position < 28 ? ('closed' as const) : ('open' as const),
        })),
      },
    };
    return ObjectiveRollup.initiatives({
      connection: crowded,
      overlays: new Map(),
      now: new Date(),
    })
      .flatMap(({ epics }) => epics)
      .find(({ id }) => id === 'E2');
  }

  static parked(id: string): ReadonlyMap<string, Overlay> {
    return new Map([
      [
        id,
        {
          id,
          parked: true,
          manualProgress: null,
          priority: null,
          dueDate: null,
        },
      ],
    ]);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: fixedNow });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ObjectiveRollup hints', () => {
  it('asks whether to mark an epic done once all its tickets are closed', () => {
    expect(Rolled.epic('E3')?.hints).toEqual(['all_tickets_closed']);
    expect(Rolled.epic('E1')?.hints).toEqual([]);
  });

  it('flags an epic with no activity in 14 days, and not one parked', () => {
    expect(Rolled.epic('E2')?.hints).toEqual(['no_recent_activity']);
    expect(Rolled.epic('E2', Rolled.parked('E2'))?.hints).toEqual([]);
  });

  it('counts the 14 days from now, not from the last sync', () => {
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
    expect(Rolled.epic('E2')?.hints).toEqual([]);

    vi.setSystemTime(new Date('2026-11-15T09:00:01Z'));
    expect(Rolled.epic('E2')?.hints).toEqual(['no_recent_activity']);
  });

  it('gives done work no hints', () => {
    expect(Rolled.initiative('PVT_archive')).toMatchObject({
      status: 'done',
      hints: [],
    });
  });
});

describe('ObjectiveRollup status and progress', () => {
  it('lets the tracker decide done and Dash decide parked', () => {
    expect(
      Rolled.initiative('PVT_docs', Rolled.parked('PVT_docs')),
    ).toMatchObject({ status: 'parked' });
    expect(
      Rolled.initiative('PVT_archive', Rolled.parked('PVT_archive')),
    ).toMatchObject({ status: 'done' });
  });

  it('measures progress from linked work, and has none without it or a manual value', () => {
    expect(Rolled.epic('E1')?.progress).toEqual({
      source: 'tracker',
      done: 1,
      total: 3,
    });
    expect(Rolled.epic('E2')?.progress).toEqual({ source: 'none' });
  });

  it('flags an epic due after its initiative without changing either date', () => {
    expect(Rolled.epic('E1')).toMatchObject({
      dueDate: { value: '2027-01-15', source: 'tracker' },
      dueAfterInitiative: true,
    });
    expect(Rolled.epic('E2')?.dueAfterInitiative).toBe(false);
  });
});

describe('ObjectiveRollup next ticket and latest update', () => {
  it('picks the open ticket with the highest priority, then the lowest position', () => {
    expect(Rolled.epic('E1')?.nextTicket).toEqual({
      id: 'T3',
      title: 'Ticket T3',
      url: 'https://github.com/acme/app/issues/T3',
      priority: 'P1',
    });
    expect(Rolled.epic('E3')?.nextTicket).toBeNull();
  });

  it('takes the newest activity across the epic’s tickets', () => {
    expect(Rolled.epic('E1')?.latestUpdate).toEqual({
      kind: 'commented',
      occurredAt: '2026-11-25T08:00:00.000Z',
      actor: 'grace',
      url: 'https://github.com/acme/app/issues/T2#comment',
      ticket: { id: 'T2', title: 'Ticket T2' },
    });
    expect(Rolled.initiative('PVT_launch')?.latestUpdate?.ticket.id).toBe('T2');
  });
});

describe('ObjectiveRollup tasks', () => {
  it('lists an epic’s open tasks before its closed ones, with their assignees and links', () => {
    expect(Rolled.epic('E1')?.tasks).toEqual({
      total: 3,
      items: [
        {
          id: 'T2',
          title: 'Ticket T2',
          url: 'https://github.com/acme/app/issues/T2',
          state: 'open',
          assignees: ['grace'],
        },
        {
          id: 'T3',
          title: 'Ticket T3',
          url: 'https://github.com/acme/app/issues/T3',
          state: 'open',
          assignees: [],
        },
        {
          id: 'T1',
          title: 'Ticket T1',
          url: 'https://github.com/acme/app/issues/T1',
          state: 'closed',
          assignees: [],
        },
      ],
      urls: [
        'https://github.com/acme/app/issues/T1',
        'https://github.com/acme/app/issues/T2',
        'https://github.com/acme/app/issues/T3',
      ],
    });
  });

  it('gives an epic with no tickets an empty list', () => {
    expect(Rolled.epic('E2')?.tasks).toEqual({
      items: [],
      total: 0,
      urls: [],
    });
  });

  it('caps the list at 25 open-first tasks and still reports the total', () => {
    const epic = Rolled.crowdedEpic();

    expect(epic?.tasks.total).toBe(30);
    expect(epic?.tasks.items).toHaveLength(25);
    expect(epic?.tasks.items.slice(0, 2).map(({ id }) => id)).toEqual([
      'X28',
      'X29',
    ]);
  });

  it('lists every task URL, closed ones included, whatever the cap', () => {
    const epic = Rolled.crowdedEpic();

    expect(epic?.tasks.urls).toHaveLength(30);
    expect(epic?.tasks.urls).toContain('https://github.com/acme/app/issues/X0');
  });
});
