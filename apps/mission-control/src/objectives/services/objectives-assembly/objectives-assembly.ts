import type {
  EpicObjective,
  InitiativeObjective,
  Objectives,
  ObjectiveStatus,
  Overlay,
} from '#src/objectives/contracts/objectives.ts';
import type { ConnectionObjectives } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import { ObjectiveRollup } from '#src/objectives/services/objective-rollup/objective-rollup.ts';

type Ordered = Pick<EpicObjective, 'id' | 'title' | 'priority' | 'dueDate'>;

/**
 * Home's objectives from stored rows: initiatives with the statuses asked for, each with
 * its epics of those statuses, both ordered by priority (P1 first), then due date (soonest
 * first, none last). An initiative's next ticket is the first listed epic's.
 */
export class ObjectivesAssembly {
  static assemble(props: {
    connections: readonly ConnectionObjectives[];
    overlays: ReadonlyMap<string, Overlay>;
    statuses: readonly ObjectiveStatus[];
    now: Date;
  }): Objectives {
    const wanted = new Set(props.statuses);
    const initiatives = props.connections
      .flatMap((connection) =>
        ObjectiveRollup.initiatives({
          connection,
          overlays: props.overlays,
          now: props.now,
        }),
      )
      .filter(({ status }) => wanted.has(status))
      .map((initiative): InitiativeObjective => {
        const epics = ObjectivesAssembly.ordered(
          initiative.epics.filter(({ status }) => wanted.has(status)),
        );
        return {
          ...initiative,
          nextTicket:
            epics.find(({ nextTicket }) => nextTicket !== null)?.nextTicket ??
            null,
          epics,
        };
      });

    return {
      connections: props.connections.map((connection) => ({
        id: connection.connectionId,
        accountLogin: connection.accountLogin,
        lastSyncedAt: connection.lastSyncedAt,
        lastError: connection.lastError,
        truncated: connection.truncated,
      })),
      initiatives: ObjectivesAssembly.ordered(initiatives),
    };
  }

  private static ordered<T extends Ordered>(items: readonly T[]): T[] {
    return items.toSorted(
      (left, right) =>
        ObjectiveRollup.rank(left.priority?.value ?? null) -
          ObjectiveRollup.rank(right.priority?.value ?? null) ||
        ObjectivesAssembly.byDueDate(left, right) ||
        left.title.localeCompare(right.title) ||
        left.id.localeCompare(right.id),
    );
  }

  private static byDueDate(left: Ordered, right: Ordered): number {
    const leftDue = left.dueDate?.value ?? null;
    const rightDue = right.dueDate?.value ?? null;
    if (leftDue === rightDue) {
      return 0;
    }
    if (leftDue === null) {
      return 1;
    }
    if (rightDue === null) {
      return -1;
    }
    return leftDue < rightDue ? -1 : 1;
  }
}
