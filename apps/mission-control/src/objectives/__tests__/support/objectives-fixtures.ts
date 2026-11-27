import type {
  Epic,
  Initiative,
  TaskTracker,
  TicketActivity,
  Ticket,
  TrackerQuery,
  TrackerSnapshot,
} from '@dash/integrations-core';

import type { ObjectiveSyncTarget } from '#src/objectives/contracts/objective-records.ts';

export const adaId = '00000000-0000-4000-8000-00000000000a';
export const graceId = '00000000-0000-4000-8000-00000000000b';
export const ownedId = '10000000-0000-4000-8000-000000000001';
export const fixedNow = new Date('2026-11-26T12:00:00.000Z');

const recently = '2026-11-25T09:00:00.000Z';

/** A provider task tracker that answers with a set snapshot, or fails, and records each query. */
export class FakeTaskTracker implements TaskTracker {
  readonly queries: TrackerQuery[] = [];
  snapshot: TrackerSnapshot = ObjectivesFixtures.snapshot();
  failure: Error | null = null;

  async read(query: TrackerQuery): Promise<TrackerSnapshot> {
    this.queries.push(query);
    if (this.failure !== null) {
      throw this.failure;
    }
    return this.snapshot;
  }
}

/**
 * Acme's tracker. Launch (due 2026-12-31) holds epic 1 (P2, due after Launch, one of three
 * tickets closed), epic 2 (P1, due 2026-12-01, no tickets, quiet since November 1) and
 * epic 3 (P1, every ticket closed). Billing has no priority or due date, Docs is open and
 * empty, and Archive is closed.
 */
export class ObjectivesFixtures {
  static target(
    overrides: Partial<ObjectiveSyncTarget> = {},
  ): ObjectiveSyncTarget {
    return {
      connectionId: ownedId,
      provider: 'github',
      installationId: '42',
      account: { login: 'acme', kind: 'organization' },
      connectedBy: adaId,
      suspended: false,
      ...overrides,
    };
  }

  static initiative(
    props: Pick<Initiative, 'externalId' | 'title'> & Partial<Initiative>,
  ): Initiative {
    return {
      provider: 'github',
      url: `https://github.com/orgs/acme/projects/${props.externalId}`,
      level: 'initiative',
      state: 'open',
      priority: null,
      dueDate: null,
      lastActivityAt: recently,
      ...props,
    };
  }

  static epic(props: Pick<Epic, 'externalId'> & Partial<Epic>): Epic {
    return {
      provider: 'github',
      url: `https://github.com/acme/app/issues/${props.externalId}`,
      level: 'epic',
      title: `Epic ${props.externalId}`,
      state: 'open',
      priority: null,
      dueDate: null,
      lastActivityAt: recently,
      initiativeIds: ['PVT_launch'],
      ...props,
    };
  }

  static ticket(
    props: Pick<Ticket, 'externalId' | 'epicId' | 'position'> & Partial<Ticket>,
  ): Ticket {
    return {
      provider: 'github',
      url: `https://github.com/acme/app/issues/${props.externalId}`,
      level: 'ticket',
      title: `Ticket ${props.externalId}`,
      state: 'open',
      priority: null,
      dueDate: null,
      lastActivityAt: recently,
      ...props,
    };
  }

  static snapshot(): TrackerSnapshot {
    const { initiative, epic, ticket } = ObjectivesFixtures;
    return {
      initiatives: [
        initiative({ externalId: 'PVT_billing', title: 'Billing' }),
        initiative({
          externalId: 'PVT_launch',
          title: 'Launch',
          dueDate: '2026-12-31',
        }),
        initiative({ externalId: 'PVT_docs', title: 'Docs' }),
        initiative({
          externalId: 'PVT_archive',
          title: 'Archive',
          state: 'closed',
        }),
      ],
      epics: [
        epic({ externalId: 'E1', priority: 'P2', dueDate: '2027-01-15' }),
        epic({
          externalId: 'E2',
          priority: 'P1',
          dueDate: '2026-12-01',
          lastActivityAt: '2026-11-01T09:00:00.000Z',
        }),
        epic({ externalId: 'E3', priority: 'P1' }),
      ],
      tickets: [
        ticket({
          externalId: 'T1',
          epicId: 'E1',
          position: 0,
          state: 'closed',
        }),
        ticket({ externalId: 'T2', epicId: 'E1', position: 1, priority: 'P3' }),
        ticket({ externalId: 'T3', epicId: 'E1', position: 2, priority: 'P1' }),
        ticket({
          externalId: 'T4',
          epicId: 'E3',
          position: 0,
          state: 'closed',
        }),
      ],
      activity: ObjectivesFixtures.activity(),
      truncated: false,
    };
  }

  private static activity(): TicketActivity[] {
    return [
      {
        ticketId: 'T1',
        kind: 'ticket_closed',
        occurredAt: '2026-11-24T10:00:00.000Z',
        actor: null,
        url: 'https://github.com/acme/app/issues/T1',
      },
      {
        ticketId: 'T2',
        kind: 'commented',
        occurredAt: '2026-11-25T08:00:00.000Z',
        actor: 'grace',
        url: 'https://github.com/acme/app/issues/T2#comment',
      },
    ];
  }
}
