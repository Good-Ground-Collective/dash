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
