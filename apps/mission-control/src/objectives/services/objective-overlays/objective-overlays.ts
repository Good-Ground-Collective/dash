import type {
  Overlay,
  OverlayChanges,
} from '#src/objectives/contracts/objectives.ts';
import {
  ObjectiveNotFoundError,
  TrackerOwnsFieldError,
} from '#src/objectives/errors.ts';
import type { ObjectiveOverlayRepository } from '#src/objectives/repositories/objective-overlays/objective-overlay-repository.ts';
import type {
  ConnectionObjectives,
  ObjectiveRecordReader,
} from '#src/objectives/repositories/objective-records/objective-record-reader.ts';

interface Found {
  priority: string | null;
  dueDate: string | null;
  linked: number;
}

export interface ObjectiveOverlays {
  /** Applies `changes` to the person's overlay for one of their initiatives or epics. */
  edit(props: {
    userId: string;
    id: string;
    changes: OverlayChanges;
  }): Promise<Overlay>;
}

/**
 * Dash's own fields beside the tracker. Parking is always Dash's; priority, due date and
 * manual progress only while the tracker has none, so the tracker stays the source of truth.
 * Clearing one of them is always allowed, so a value set before the tracker had its own can go.
 */
export class TrackedObjectiveOverlays implements ObjectiveOverlays {
  private readonly reader: Pick<ObjectiveRecordReader, 'recordsFor'>;
  private readonly overlays: ObjectiveOverlayRepository;

  constructor(props: {
    reader: Pick<ObjectiveRecordReader, 'recordsFor'>;
    overlays: ObjectiveOverlayRepository;
  }) {
    this.reader = props.reader;
    this.overlays = props.overlays;
  }

  async edit(props: {
    userId: string;
    id: string;
    changes: OverlayChanges;
  }): Promise<Overlay> {
    const connections = await this.reader.recordsFor({
      connectedBy: props.userId,
    });
    const found = TrackedObjectiveOverlays.find({ connections, id: props.id });
    if (found === null) {
      throw new ObjectiveNotFoundError({ id: props.id });
    }

    const { changes } = props;
    if ((changes.priority ?? null) !== null && found.priority !== null) {
      throw new TrackerOwnsFieldError({ field: 'priority' });
    }
    if ((changes.dueDate ?? null) !== null && found.dueDate !== null) {
      throw new TrackerOwnsFieldError({ field: 'dueDate' });
    }
    if ((changes.manualProgress ?? null) !== null && found.linked > 0) {
      throw new TrackerOwnsFieldError({ field: 'manualProgress' });
    }
    return this.overlays.save(props);
  }

  /** The initiative or epic, its tracker fields and how many epics or tickets are linked to it. */
  private static find(props: {
    connections: readonly ConnectionObjectives[];
    id: string;
  }): Found | null {
    for (const { records } of props.connections) {
      const initiative = records.initiatives.find(
        ({ nodeId }) => nodeId === props.id,
      );
      if (initiative !== undefined) {
        return {
          ...initiative,
          linked: records.placements.filter(
            ({ initiativeNodeId }) => initiativeNodeId === props.id,
          ).length,
        };
      }
      const epic = records.epics.find(({ nodeId }) => nodeId === props.id);
      if (epic !== undefined) {
        return {
          ...epic,
          linked: records.tickets.filter(
            ({ epicNodeId }) => epicNodeId === props.id,
          ).length,
        };
      }
    }
    return null;
  }
}
