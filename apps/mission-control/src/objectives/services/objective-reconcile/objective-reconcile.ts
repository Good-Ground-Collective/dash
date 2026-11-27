import {
  type TaskTracker,
  TrackerAccountUnsupportedError,
} from '@dash/integrations-core';
import { z } from 'zod';

import {
  ObjectiveConnectionUnreadableError,
  ObjectiveInstallationSuspendedError,
} from '#src/objectives/errors.ts';
import type { ObjectiveRecordReader } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import type { ObjectiveRecordWriter } from '#src/objectives/repositories/objective-records/objective-record-writer.ts';
import { TrackerRecords } from '#src/objectives/services/tracker-records/tracker-records.ts';

/** The most connections one scheduled run reads. The least recently tried go first, so all of them take turns. */
const maxConnectionsPerRun = 50;
const maxConnectionsPerPerson = 20;

const statusSchema = z.object({ status: z.int() });

/** A provider's task tracker, offered by its integration. */
export interface ProviderTracker {
  provider: string;
  tracker: TaskTracker;
}

export type ObjectiveSyncOutcome =
  | { status: 'synced' | 'skipped' | 'stale' }
  | { status: 'failed'; error: string };

export interface ObjectiveReconcile {
  dueConnectionIds(): Promise<string[]>;
  connectionIdsOf(props: { userId: string }): Promise<string[]>;
  /** The owned connection of the provider's installation, or null when Dash reads no tracker for it. */
  connectionIdOf(props: {
    provider: string;
    installationId: string;
  }): Promise<string | null>;
  syncConnection(props: {
    connectionId: string;
  }): Promise<ObjectiveSyncOutcome>;
}

/**
 * Keeps the stored objectives in step with each owned connection's tracker: reads it through
 * its provider's task tracker and replaces what the last read stored. A failed read is
 * recorded on the connection and keeps the previous rows, so home shows them as stale
 * instead of empty. Dash's overlays are never part of a read.
 */
export class TrackedObjectiveReconcile implements ObjectiveReconcile {
  private readonly trackers: readonly ProviderTracker[];
  private readonly reader: ObjectiveRecordReader;
  private readonly writer: ObjectiveRecordWriter;

  constructor(props: {
    trackers: readonly ProviderTracker[];
    reader: ObjectiveRecordReader;
    writer: ObjectiveRecordWriter;
  }) {
    this.trackers = props.trackers;
    this.reader = props.reader;
    this.writer = props.writer;
  }

  async dueConnectionIds(): Promise<string[]> {
    const targets = await this.reader.syncTargets({
      providers: this.providers(),
      limit: maxConnectionsPerRun,
    });
    return targets.map(({ connectionId }) => connectionId);
  }

  async connectionIdsOf(props: { userId: string }): Promise<string[]> {
    const targets = await this.reader.syncTargets({
      providers: this.providers(),
      connectedBy: props.userId,
      limit: maxConnectionsPerPerson,
    });
    return targets.map(({ connectionId }) => connectionId);
  }

  async connectionIdOf(props: {
    provider: string;
    installationId: string;
  }): Promise<string | null> {
    const [target] = await this.reader.syncTargets({
      providers: this.providers().filter(
        (provider) => provider === props.provider,
      ),
      installationId: props.installationId,
      limit: 1,
    });
    return target?.connectionId ?? null;
  }

  async syncConnection(props: {
    connectionId: string;
  }): Promise<ObjectiveSyncOutcome> {
    const [target] = await this.reader.syncTargets({
      providers: this.providers(),
      connectionId: props.connectionId,
      limit: 1,
    });
    const tracker = this.trackers.find(
      ({ provider }) => provider === target?.provider,
    )?.tracker;
    if (target === undefined || tracker === undefined) {
      return { status: 'skipped' };
    }

    const attemptedAt = new Date();
    try {
      if (target.suspended) {
        throw new ObjectiveInstallationSuspendedError();
      }
      if (target.installationId === null || target.connectedBy === null) {
        throw new ObjectiveConnectionUnreadableError({
          connectionId: target.connectionId,
        });
      }
      const snapshot = await tracker.read({
        installationId: target.installationId,
        account: target.account,
      });
      const { applied } = await this.writer.replace({
        connectionId: target.connectionId,
        records: TrackerRecords.from(snapshot),
        truncated: snapshot.truncated,
        syncedAt: attemptedAt,
      });
      return { status: applied ? 'synced' : 'stale' };
    } catch (thrown) {
      const error =
        thrown instanceof Error ? thrown : new Error('A non-error was thrown');
      await this.writer.recordFailure({
        connectionId: target.connectionId,
        error: TrackedObjectiveReconcile.describe(error),
        attemptedAt,
      });
      return { status: 'failed', error: `${error.name}: ${error.message}` };
    }
  }

  private providers(): string[] {
    return this.trackers.map(({ provider }) => provider);
  }

  /** What home shows. Only Dash's own messages pass through; a provider's error could carry request details. */
  private static describe(error: Error): string {
    if (error instanceof ObjectiveInstallationSuspendedError) {
      return error.message;
    }
    if (error instanceof TrackerAccountUnsupportedError) {
      return 'Dash reads initiatives from an organisation’s tracker. The provider doesn’t let its app read ones a personal account owns.';
    }
    if (error instanceof ObjectiveConnectionUnreadableError) {
      return 'This connection can’t be read until it is reconnected.';
    }
    const status = statusSchema.safeParse(error);
    return status.success
      ? `The tracker answered ${status.data.status}. Dash tries again at the next sync.`
      : 'Reading the tracker failed. Dash tries again at the next sync.';
  }
}
