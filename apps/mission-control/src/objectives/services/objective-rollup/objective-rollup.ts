import type {
  ActivityRecord,
  EpicRecord,
  InitiativeRecord,
  TicketRecord,
} from '#src/objectives/contracts/objective-records.ts';
import type {
  EpicObjective,
  EpicTasks,
  InitiativeObjective,
  NextTicket,
  ObjectiveHint,
  ObjectiveProgress,
  ObjectiveUpdate,
  Overlay,
} from '#src/objectives/contracts/objectives.ts';
import type { ConnectionObjectives } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';

const quietAfterMilliseconds = 14 * 24 * 60 * 60 * 1000;
const maxTasksPerEpic = 25;
const priorityRank = { P1: 0, P2: 1, P3: 2 } as const;

type Tracked = InitiativeRecord | EpicRecord;

/** Shared by every initiative and epic of one connection. */
interface Rollup {
  connectionId: string;
  overlays: ReadonlyMap<string, Overlay>;
  now: Date;
  ticketsOf: ReadonlyMap<string, TicketRecord[]>;
  activityOf: ReadonlyMap<string, ActivityRecord[]>;
}

/**
 * One connection's stored records as initiatives with their epics: status, priority and
 * due date (the tracker's first, Dash's when it has none), progress, the latest update, the
 * next ticket and the hints. Every epic is returned; filtering and ordering are the caller's.
 */
export class ObjectiveRollup {
  static initiatives(props: {
    connection: ConnectionObjectives;
    overlays: ReadonlyMap<string, Overlay>;
    now: Date;
  }): InitiativeObjective[] {
    const { records } = props.connection;
    const rollup: Rollup = {
      connectionId: props.connection.connectionId,
      overlays: props.overlays,
      now: props.now,
      ticketsOf: Map.groupBy(records.tickets, ({ epicNodeId }) => epicNodeId),
      activityOf: Map.groupBy(
        records.activity,
        ({ ticketNodeId }) => ticketNodeId,
      ),
    };
    const epics = new Map(records.epics.map((epic) => [epic.nodeId, epic]));

    return records.initiatives.map((initiative) => {
      const placed = records.placements.flatMap(
        ({ initiativeNodeId, epicNodeId }) => {
          const epic = epics.get(epicNodeId);
          return initiativeNodeId === initiative.nodeId && epic !== undefined
            ? [epic]
            : [];
        },
      );
      return ObjectiveRollup.initiative({ rollup, initiative, epics: placed });
    });
  }

  /** P1 first, no priority last. */
  static rank(priority: keyof typeof priorityRank | null): number {
    return priority === null ? 3 : priorityRank[priority];
  }

  private static initiative(props: {
    rollup: Rollup;
    initiative: InitiativeRecord;
    epics: readonly EpicRecord[];
  }): InitiativeObjective {
    const { rollup, initiative } = props;
    const base = ObjectiveRollup.tracked({ rollup, record: initiative });
    const epics = props.epics.map((epic) =>
      ObjectiveRollup.epic({ rollup, epic, initiativeDue: base.dueDate }),
    );
    const closed = epics.filter(({ status }) => status === 'done').length;

    return {
      ...base,
      progress: ObjectiveRollup.progress({
        overlay: rollup.overlays.get(initiative.nodeId),
        done: closed,
        total: epics.length,
      }),
      latestUpdate: ObjectiveRollup.newest(
        epics.flatMap(({ latestUpdate }) =>
          latestUpdate === null ? [] : [latestUpdate],
        ),
      ),
      nextTicket: null,
      hints: ObjectiveRollup.hints({
        rollup,
        record: initiative,
        allClosed:
          epics.length > 0 && closed === epics.length
            ? 'all_epics_closed'
            : null,
      }),
      epics,
    };
  }

  private static epic(props: {
    rollup: Rollup;
    epic: EpicRecord;
    initiativeDue: { value: string } | null;
  }): EpicObjective {
    const { rollup, epic } = props;
    const base = ObjectiveRollup.tracked({ rollup, record: epic });
    const tickets = rollup.ticketsOf.get(epic.nodeId) ?? [];
    const closed = tickets.filter(({ state }) => state === 'closed').length;

    return {
      ...base,
      progress: ObjectiveRollup.progress({
        overlay: rollup.overlays.get(epic.nodeId),
        done: closed,
        total: tickets.length,
      }),
      latestUpdate: ObjectiveRollup.newest(
        tickets.flatMap((ticket) =>
          (rollup.activityOf.get(ticket.nodeId) ?? []).map((activity) => ({
            kind: activity.kind,
            occurredAt: activity.occurredAt,
            actor: activity.actor,
            url: activity.url,
            ticket: { id: ticket.nodeId, title: ticket.title },
          })),
        ),
      ),
      nextTicket: ObjectiveRollup.nextTicket(tickets),
      tasks: ObjectiveRollup.tasks(tickets),
      hints: ObjectiveRollup.hints({
        rollup,
        record: epic,
        allClosed:
          tickets.length > 0 && closed === tickets.length
            ? 'all_tickets_closed'
            : null,
      }),
      dueAfterInitiative:
        base.dueDate !== null &&
        props.initiativeDue !== null &&
        base.dueDate.value > props.initiativeDue.value,
    };
  }

  /** Status, priority and due date: the tracker decides done; parking and missing fields come from Dash. */
  private static tracked(props: { rollup: Rollup; record: Tracked }) {
    const { rollup, record } = props;
    const overlay = rollup.overlays.get(record.nodeId);
    const parked = overlay?.parked ?? false;
    const fromDash = <T>(value: T | null | undefined) =>
      value === null || value === undefined
        ? null
        : { value, source: 'dash' as const };

    return {
      id: record.nodeId,
      connectionId: rollup.connectionId,
      title: record.title,
      url: record.url,
      status:
        record.state === 'closed'
          ? ('done' as const)
          : parked
            ? ('parked' as const)
            : ('active' as const),
      priority:
        record.priority === null
          ? fromDash(overlay?.priority)
          : { value: record.priority, source: 'tracker' as const },
      dueDate:
        record.dueDate === null
          ? fromDash(overlay?.dueDate)
          : { value: record.dueDate, source: 'tracker' as const },
      lastActivityAt: record.lastActivityAt,
    };
  }

  private static progress(props: {
    overlay: Overlay | undefined;
    done: number;
    total: number;
  }): ObjectiveProgress {
    if (props.total > 0) {
      return { source: 'tracker', done: props.done, total: props.total };
    }
    const percent = props.overlay?.manualProgress ?? null;
    return percent === null
      ? { source: 'none' }
      : { source: 'manual', percent };
  }

  /** Only open work gets hints: done needs none, and parked work is quiet on purpose. */
  private static hints(props: {
    rollup: Rollup;
    record: Tracked;
    allClosed: ObjectiveHint | null;
  }): ObjectiveHint[] {
    const { rollup, record } = props;
    if (record.state === 'closed') {
      return [];
    }
    const hints: ObjectiveHint[] =
      props.allClosed === null ? [] : [props.allClosed];
    const quiet =
      rollup.now.getTime() - Date.parse(record.lastActivityAt) >
      quietAfterMilliseconds;
    if (quiet && rollup.overlays.get(record.nodeId)?.parked !== true) {
      hints.push('no_recent_activity');
    }
    return hints;
  }

  /** Open tasks first, then closed ones, each group in the epic's order, capped so an epic never sends its whole backlog. */
  private static tasks(tickets: readonly TicketRecord[]): EpicTasks {
    const items = tickets
      .toSorted(
        (left, right) =>
          Number(left.state === 'closed') - Number(right.state === 'closed') ||
          left.position - right.position,
      )
      .slice(0, maxTasksPerEpic)
      .map((ticket) => ({
        id: ticket.nodeId,
        title: ticket.title,
        url: ticket.url,
        state: ticket.state,
        assignees: ticket.assignees,
      }));
    return { items, total: tickets.length };
  }

  private static nextTicket(
    tickets: readonly TicketRecord[],
  ): NextTicket | null {
    const [next] = tickets
      .filter(({ state }) => state === 'open')
      .toSorted(
        (left, right) =>
          ObjectiveRollup.rank(left.priority) -
            ObjectiveRollup.rank(right.priority) ||
          left.position - right.position,
      );
    return next === undefined
      ? null
      : {
          id: next.nodeId,
          title: next.title,
          url: next.url,
          priority: next.priority,
        };
  }

  private static newest(
    updates: readonly ObjectiveUpdate[],
  ): ObjectiveUpdate | null {
    return updates.reduce<ObjectiveUpdate | null>(
      (newest, update) =>
        newest === null ||
        Date.parse(update.occurredAt) > Date.parse(newest.occurredAt)
          ? update
          : newest,
      null,
    );
  }
}
