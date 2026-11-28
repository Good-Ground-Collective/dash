import type {
  EpicObjective,
  EpicTask,
  InitiativeObjective,
  ObjectiveHint,
  ObjectiveProgress,
  ObjectiveStatus,
} from '#lib/api/objectives-contracts.ts';
import { RelativeTime } from '#lib/github-feed/relative-time.ts';

type Objective = InitiativeObjective | EpicObjective;
type Update = NonNullable<Objective['latestUpdate']>;

/** A value Dash shows, and whether it came from Dash rather than the tracker. */
export interface ObjectiveField {
  label: string;
  fromDash: boolean;
}

export interface ObjectiveProgressView {
  /** “3 of 5 done”, or “40%” when set by hand. */
  label: string;
  percent: number;
  fromDash: boolean;
}

/** One of an epic's tasks as its list shows it. */
export interface ObjectiveTaskRow {
  id: string;
  title: string;
  href: string;
  done: boolean;
  /** “To do” or “Done”. */
  stateLabel: string;
  /** The people it is assigned to, or null when nobody has it. */
  assignee: string | null;
}

/** An epic's task list: open tasks first, and how many more the epic has on GitHub than are listed. */
export interface ObjectiveTaskList {
  items: ObjectiveTaskRow[];
  hiddenCount: number;
}

/** An initiative or epic as its row shows it. Every row links to the tracker. */
export interface ObjectiveRow {
  id: string;
  title: string;
  href: string;
  status: ObjectiveStatus;
  priority: ObjectiveField | null;
  /** “Due 12 Dec”, or with the year when it isn't this year. */
  due: ObjectiveField | null;
  progress: ObjectiveProgressView | null;
  update: { text: string; href: string } | null;
  next: { title: string; href: string } | null;
  tasks: ObjectiveTaskList;
  hints: string[];
  dueAfterInitiative: boolean;
}

const hintLabels = {
  all_tickets_closed: 'All tickets closed',
  all_epics_closed: 'All epics closed',
  no_recent_activity: 'No activity in 14 days',
} satisfies Record<ObjectiveHint, string>;

const updateVerbs = {
  ticket_closed: 'closed',
  pull_request_merged: 'merged a pull request for',
  commented: 'commented on',
} satisfies Record<Update['kind'], string>;

export class ObjectiveRows {
  static of(objective: Objective): ObjectiveRow {
    return {
      id: objective.id,
      title: objective.title,
      href: objective.url,
      status: objective.status,
      priority:
        objective.priority === null
          ? null
          : {
              label: objective.priority.value,
              fromDash: objective.priority.source === 'dash',
            },
      due:
        objective.dueDate === null
          ? null
          : {
              label: `Due ${ObjectiveRows.day(objective.dueDate.value)}`,
              fromDash: objective.dueDate.source === 'dash',
            },
      progress: ObjectiveRows.progress(objective.progress),
      update: ObjectiveRows.update(objective.latestUpdate),
      next:
        objective.nextTicket === null
          ? null
          : {
              title: objective.nextTicket.title,
              href: objective.nextTicket.url,
            },
      tasks: ObjectiveRows.tasks(objective),
      hints: objective.hints.map((hint) => hintLabels[hint]),
      dueAfterInitiative:
        'dueAfterInitiative' in objective && objective.dueAfterInitiative,
    };
  }

  static tasks(objective: Objective): ObjectiveTaskList {
    if (!('tasks' in objective)) return { items: [], hiddenCount: 0 };
    const { items, total } = objective.tasks;
    return {
      items: items.map((task) => ObjectiveRows.task(task)),
      hiddenCount: Math.max(total - items.length, 0),
    };
  }

  static progress(progress: ObjectiveProgress): ObjectiveProgressView | null {
    if (progress.source === 'none') return null;
    if (progress.source === 'manual') {
      return {
        label: `${progress.percent}%`,
        percent: progress.percent,
        fromDash: true,
      };
    }
    return {
      label: `${progress.done} of ${progress.total} done`,
      percent:
        progress.total === 0
          ? 0
          : Math.round((progress.done / progress.total) * 100),
      fromDash: false,
    };
  }

  /** “grace closed “Fix login” · 2 hours ago”. */
  static update(update: Update | null): ObjectiveRow['update'] {
    if (update === null) return null;
    const who = update.actor ?? 'Someone';
    const when = RelativeTime.since(update.occurredAt);
    return {
      text: `${who} ${updateVerbs[update.kind]} “${update.ticket.title}” · ${when}`,
      href: update.url,
    };
  }

  /** A calendar date as “12 Dec”, adding the year when it isn't the current one. */
  static day(isoDate: string): string {
    const date = new Date(`${isoDate}T00:00:00Z`);
    const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    };
    if (!sameYear) options.year = 'numeric';
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  }

  private static task(task: EpicTask): ObjectiveTaskRow {
    const done = task.state === 'closed';
    return {
      id: task.id,
      title: task.title,
      href: task.url,
      done,
      stateLabel: done ? 'Done' : 'To do',
      assignee: task.assignees.length === 0 ? null : task.assignees.join(', '),
    };
  }
}
