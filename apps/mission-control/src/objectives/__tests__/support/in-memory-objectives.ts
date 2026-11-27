import type {
  ObjectiveRecords,
  ObjectiveSyncTarget,
} from '#src/objectives/contracts/objective-records.ts';
import type {
  Overlay,
  OverlayChanges,
} from '#src/objectives/contracts/objectives.ts';
import type { ObjectiveOverlayRepository } from '#src/objectives/repositories/objective-overlays/objective-overlay-repository.ts';
import type {
  ConnectionObjectives,
  ObjectiveRecordReader,
} from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import type { ObjectiveRecordWriter } from '#src/objectives/repositories/objective-records/objective-record-writer.ts';

interface StoredSync {
  lastSyncedAt: Date | null;
  lastAttemptedAt: Date;
  lastError: string | null;
  truncated: boolean | null;
  records: ObjectiveRecords;
}

/** Connections and their objective rows in memory, replaced whole on each read the way the tables are upserted and pruned. */
export class InMemoryObjectiveRecords
  implements ObjectiveRecordReader, ObjectiveRecordWriter
{
  readonly targets: ObjectiveSyncTarget[] = [];
  readonly syncs = new Map<string, StoredSync>();

  add(target: ObjectiveSyncTarget): this {
    this.targets.push(target);
    return this;
  }

  async syncTargets(props: {
    providers: readonly string[];
    connectionId?: string;
    installationId?: string;
    connectedBy?: string;
    limit: number;
  }): Promise<ObjectiveSyncTarget[]> {
    const attempted = (target: ObjectiveSyncTarget) =>
      this.syncs.get(target.connectionId)?.lastAttemptedAt.getTime() ?? -1;
    return this.targets
      .filter(
        (target) =>
          props.providers.includes(target.provider) &&
          (props.connectionId === undefined ||
            target.connectionId === props.connectionId) &&
          (props.installationId === undefined ||
            target.installationId === props.installationId) &&
          (props.connectedBy === undefined ||
            target.connectedBy === props.connectedBy),
      )
      .toSorted((left, right) => attempted(left) - attempted(right))
      .slice(0, props.limit);
  }

  async recordsFor(props: {
    connectedBy: string;
  }): Promise<ConnectionObjectives[]> {
    return this.targets.flatMap((target) => {
      const sync = this.syncs.get(target.connectionId);
      return target.connectedBy !== props.connectedBy || sync === undefined
        ? []
        : [
            {
              connectionId: target.connectionId,
              accountLogin: target.account.login,
              lastSyncedAt: sync.lastSyncedAt?.toISOString() ?? null,
              lastError: sync.lastError,
              truncated: sync.truncated,
              records: sync.records,
            },
          ];
    });
  }

  async replace(props: {
    connectionId: string;
    records: ObjectiveRecords;
    truncated: boolean;
    syncedAt: Date;
  }): Promise<{ applied: boolean }> {
    const stored = this.syncs.get(props.connectionId);
    if (
      stored?.lastSyncedAt !== null &&
      stored?.lastSyncedAt !== undefined &&
      stored.lastSyncedAt > props.syncedAt
    ) {
      return { applied: false };
    }
    this.syncs.set(props.connectionId, {
      lastSyncedAt: props.syncedAt,
      lastAttemptedAt: props.syncedAt,
      lastError: null,
      truncated: props.truncated,
      records: props.records,
    });
    return { applied: true };
  }

  async recordFailure(props: {
    connectionId: string;
    error: string;
    attemptedAt: Date;
  }): Promise<void> {
    const stored = this.syncs.get(props.connectionId);
    this.syncs.set(props.connectionId, {
      lastSyncedAt: stored?.lastSyncedAt ?? null,
      lastAttemptedAt: props.attemptedAt,
      lastError: props.error,
      truncated: stored?.truncated ?? null,
      records: stored?.records ?? InMemoryObjectiveRecords.empty(),
    });
  }

  static empty(): ObjectiveRecords {
    return {
      initiatives: [],
      epics: [],
      placements: [],
      tickets: [],
      activity: [],
    };
  }
}

/** Overlays in memory, keyed like the table on person and tracker node id. */
export class InMemoryObjectiveOverlays implements ObjectiveOverlayRepository {
  readonly stored = new Map<string, Overlay>();

  async listFor(props: { userId: string }): Promise<Map<string, Overlay>> {
    return new Map(
      [...this.stored]
        .filter(([key]) => key.startsWith(`${props.userId}/`))
        .map(([, overlay]) => [overlay.id, overlay]),
    );
  }

  async save(props: {
    userId: string;
    id: string;
    changes: OverlayChanges;
  }): Promise<Overlay> {
    const key = `${props.userId}/${props.id}`;
    const current = this.stored.get(key);
    const { changes } = props;
    const overlay: Overlay = {
      id: props.id,
      parked: changes.parked ?? current?.parked ?? false,
      manualProgress:
        changes.manualProgress === undefined
          ? (current?.manualProgress ?? null)
          : changes.manualProgress,
      priority:
        changes.priority === undefined
          ? (current?.priority ?? null)
          : changes.priority,
      dueDate:
        changes.dueDate === undefined
          ? (current?.dueDate ?? null)
          : changes.dueDate,
    };
    this.stored.set(key, overlay);
    return overlay;
  }
}
