export const acmeConnectionId = '0b7d6a1e-1111-4c1a-9a51-2f1f6a3c0001';

/** Dash's own values for one initiative or epic, as `PATCH /objectives/:id/overlay` keeps them. */
export interface StubOverlay {
  parked: boolean;
  manualProgress: number | null;
  priority: string | null;
  dueDate: string | null;
}

/** A task of an epic, in the epic's order. */
export interface StubTask {
  title: string;
  closed?: boolean;
  assignees?: string[];
}

/** An initiative or epic as the tracker has it, before Dash's overlay. */
export interface StubObjective {
  id: string;
  title: string;
  url: string;
  closed: boolean;
  priority: string | null;
  dueDate: string | null;
  progress: { done: number; total: number } | null;
  update: {
    kind: string;
    actor: string;
    minutes: number;
    ticket: string;
  } | null;
  next: string | null;
  tasks?: StubTask[];
  hints: string[];
  dueAfterInitiative?: boolean;
  epics?: StubObjective[];
}

const repo = 'https://github.com/acme-labs/api';

/** The populated tracker for `ObjectivesStub`: two active initiatives, a parked epic and a closed initiative. */
export class ObjectivesItems {
  static initiatives(): StubObjective[] {
    return [
      {
        ...ObjectivesItems.base('PVT_launch', 'Public launch', null),
        url: 'https://github.com/orgs/acme-labs/projects/1',
        priority: 'P1',
        dueDate: '2026-12-18',
        progress: { done: 1, total: 3 },
        update: ObjectivesItems.update('grace', 'Hash recovery codes', 45),
        next: 'Rate-limit sign-in attempts',
        epics: ObjectivesItems.launchEpics(),
      },
      {
        ...ObjectivesItems.base('PVT_docs', 'Docs refresh', null),
        url: 'https://github.com/orgs/acme-labs/projects/2',
        progress: { done: 100, total: 120 },
        hints: ['no_recent_activity'],
        epics: [
          {
            ...ObjectivesItems.base('E_guides', 'Rewrite the guides', 20),
            progress: null,
            hints: ['no_recent_activity'],
          },
          {
            ...ObjectivesItems.base('E_reference', 'Refresh API reference', 21),
            dueDate: ObjectivesItems.nextYearDay(),
            progress: { done: 12, total: 12 },
          },
          {
            ...ObjectivesItems.base('E_changelog', 'Publish the changelog', 22),
            progress: { done: 3, total: 5 },
          },
        ],
      },
      {
        ...ObjectivesItems.base('PVT_beta', 'Private beta', null),
        url: 'https://github.com/orgs/acme-labs/projects/3',
        closed: true,
        priority: 'P2',
        progress: { done: 1, total: 1 },
        hints: ['all_epics_closed'],
        epics: [
          {
            ...ObjectivesItems.base('E_invites', 'Invite flow', 30),
            closed: true,
            progress: { done: 4, total: 4 },
            hints: ['all_tickets_closed'],
          },
        ],
      },
    ];
  }

  static wire(props: {
    item: StubObjective;
    overlay: StubOverlay | undefined;
    claimed: boolean;
  }) {
    const { item, overlay } = props;
    const field = (tracker: string | null, dash: string | null | undefined) =>
      tracker !== null
        ? { value: tracker, source: 'tracker' }
        : dash === null || dash === undefined
          ? null
          : { value: dash, source: 'dash' };
    const parked = overlay?.parked === true;
    const percent = overlay?.manualProgress ?? null;
    return {
      id: item.id,
      connectionId: acmeConnectionId,
      title: item.title,
      url: item.url,
      status: item.closed ? 'done' : parked ? 'parked' : 'active',
      priority: field(props.claimed ? 'P1' : item.priority, overlay?.priority),
      dueDate: field(item.dueDate, overlay?.dueDate),
      progress:
        item.progress !== null
          ? { source: 'tracker', ...item.progress }
          : percent === null
            ? { source: 'none' }
            : { source: 'manual', percent },
      lastActivityAt: ObjectivesItems.ago(item.update?.minutes ?? 60 * 24 * 20),
      latestUpdate: ObjectivesItems.latestUpdate(item.update),
      nextTicket:
        item.next === null
          ? null
          : {
              id: `I_${item.id}`,
              title: item.next,
              url: `${repo}/issues/77`,
              priority: 'P1',
            },
      hints: item.hints,
    };
  }

  /** An epic's tasks as Mission Control sends them: open ones first, and the epic's own count. */
  static tasks(item: StubObjective) {
    const tasks = (item.tasks ?? []).map((task, index) => ({
      id: `I_${item.id}_${String(index)}`,
      title: task.title,
      url: `${repo}/issues/${String(100 + index)}`,
      state: task.closed === true ? 'closed' : 'open',
      assignees: task.assignees ?? [],
    }));
    return {
      items: tasks.toSorted(
        (left, right) =>
          Number(left.state === 'closed') - Number(right.state === 'closed'),
      ),
      total: tasks.length,
    };
  }

  /** A date in May of next year, so its label always carries the year, the widest form. */
  static nextYearDay(): string {
    return `${String(new Date().getFullYear() + 1)}-05-28`;
  }

  static ago(minutes: number): string {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
  }

  private static launchEpics(): StubObjective[] {
    return [
      {
        ...ObjectivesItems.base('E_passkeys', 'Sign-in with passkeys', 10),
        priority: 'P1',
        dueDate: '2026-12-04',
        progress: { done: 4, total: 6 },
        update: ObjectivesItems.update('grace', 'Hash recovery codes', 45),
        next: 'Rate-limit sign-in attempts',
        tasks: [
          { title: 'Hash recovery codes', closed: true, assignees: ['grace'] },
          { title: 'Rate-limit sign-in attempts', assignees: ['ada'] },
          { title: 'Show a passkey nickname' },
        ],
      },
      {
        ...ObjectivesItems.base('E_billing', 'Billing page', 11),
        dueDate: '2027-01-08',
        dueAfterInitiative: true,
        progress: { done: 0, total: 3 },
        update: ObjectivesItems.update(
          'linus',
          'Pick a payment provider',
          60 * 26,
        ),
        next: 'Pick a payment provider',
      },
      {
        ...ObjectivesItems.base('E_status', 'Status page', 12),
        progress: null,
      },
    ];
  }

  private static base(
    id: string,
    title: string,
    issue: number | null,
  ): StubObjective {
    return {
      id,
      title,
      url: issue === null ? repo : `${repo}/issues/${issue}`,
      closed: false,
      priority: null,
      dueDate: null,
      progress: null,
      update: null,
      next: null,
      hints: [],
    };
  }

  private static update(actor: string, ticket: string, minutes: number) {
    return { kind: 'ticket_closed', actor, ticket, minutes };
  }

  private static latestUpdate(update: StubObjective['update']) {
    if (update === null) return null;
    return {
      kind: update.kind,
      occurredAt: ObjectivesItems.ago(update.minutes),
      actor: update.actor,
      url: `${repo}/issues/70`,
      ticket: { id: 'I_70', title: update.ticket },
    };
  }
}
