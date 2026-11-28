import type {
  EpicObjective,
  InitiativeObjective,
  Objectives,
} from '#lib/api/objectives-contracts.ts';

type Connection = Objectives['connections'][number];

/** Objectives as Mission Control sends them, with only what a test cares about spelled out. */
export class SampleObjectives {
  static connection(overrides: Partial<Connection> = {}): Connection {
    return {
      id: 'c-acme',
      accountLogin: 'acme-labs',
      lastSyncedAt: new Date('2026-11-27T11:55:00Z'),
      lastError: null,
      truncated: false,
      ...overrides,
    };
  }

  static epic(overrides: Partial<EpicObjective> = {}): EpicObjective {
    return {
      id: 'E_1',
      connectionId: 'c-acme',
      title: 'Sign-in with passkeys',
      url: 'https://github.com/acme-labs/api/issues/10',
      status: 'active',
      priority: { value: 'P1', source: 'tracker' },
      dueDate: { value: '2026-12-12', source: 'tracker' },
      progress: { source: 'tracker', done: 3, total: 5 },
      lastActivityAt: new Date('2026-11-27T09:00:00Z'),
      latestUpdate: null,
      nextTicket: null,
      tasks: { items: [], total: 0, urls: [] },
      hints: [],
      dueAfterInitiative: false,
      ...overrides,
    };
  }

  static initiative(
    overrides: Partial<InitiativeObjective> = {},
  ): InitiativeObjective {
    return {
      id: 'PVT_1',
      connectionId: 'c-acme',
      title: 'Launch',
      url: 'https://github.com/orgs/acme-labs/projects/1',
      status: 'active',
      priority: null,
      dueDate: null,
      progress: { source: 'tracker', done: 0, total: 1 },
      lastActivityAt: new Date('2026-11-27T09:00:00Z'),
      latestUpdate: null,
      nextTicket: null,
      hints: [],
      epics: [SampleObjectives.epic()],
      ...overrides,
    };
  }

  static objectives(overrides: Partial<Objectives> = {}): Objectives {
    return {
      connections: [SampleObjectives.connection()],
      initiatives: [SampleObjectives.initiative()],
      ...overrides,
    };
  }
}
