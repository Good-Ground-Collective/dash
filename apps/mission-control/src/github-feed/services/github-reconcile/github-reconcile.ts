import { z } from 'zod';

import type { ConnectionKind } from '#src/github-feed/contracts/github-records.ts';
import type { GithubSource } from '#src/github-feed/contracts/github-source.ts';
import {
  ConnectionNotReadableError,
  ConnectorUnknownError,
  InstallationSuspendedError,
  ViewerNotLinkedError,
} from '#src/github-feed/errors.ts';
import type { GithubRecordReader } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import type { GithubRecordWriter } from '#src/github-feed/repositories/github-records/github-record-writer.ts';
import {
  type ErrorDescriber,
  RedactingErrorDescriber,
} from '#src/github-feed/services/github-reconcile/redacting-error-describer.ts';

/** The most connections one scheduled run reads. The least recently tried go first, so all of them take turns. */
const maxConnectionsPerRun = 50;
const maxConnectionsPerPerson = 20;

/** Three schedule intervals: a connection not read successfully for this long has missed several scheduled reads, which only happens when something keeps them from running or succeeding. */
const staleAfterMs = 3 * 15 * 60_000;

const statusSchema = z.object({ status: z.int() });

export type SyncOutcome =
  | { status: 'synced' | 'skipped' | 'stale' }
  | { status: 'failed'; error: string };

export interface StaleConnection {
  connectionId: string;
  lastSyncedAt: Date;
}

export interface GithubReconcile {
  /** Connections last read successfully more than three schedule intervals ago. */
  staleConnections(): Promise<StaleConnection[]>;
  dueConnectionIds(): Promise<string[]>;
  connectionIdsOf(props: { userId: string }): Promise<string[]>;
  syncConnection(props: { connectionId: string }): Promise<SyncOutcome>;
}

/**
 * Keeps stored GitHub rows in step with GitHub: reads each connection through the source
 * for its kind and replaces what the last read stored. A failed read is recorded on the
 * connection and keeps the previous rows, so the feed shows them as stale instead of empty.
 */
export class SourcedGithubReconcile implements GithubReconcile {
  private readonly sources: readonly GithubSource[];
  private readonly reader: GithubRecordReader;
  private readonly writer: GithubRecordWriter;
  private readonly errorDescriber: ErrorDescriber =
    new RedactingErrorDescriber();

  constructor(props: {
    sources: readonly GithubSource[];
    reader: GithubRecordReader;
    writer: GithubRecordWriter;
  }) {
    this.sources = props.sources;
    this.reader = props.reader;
    this.writer = props.writer;
  }

  async staleConnections(): Promise<StaleConnection[]> {
    return this.reader.staleSyncs({
      before: new Date(Date.now() - staleAfterMs),
      kinds: this.kinds(),
    });
  }

  async dueConnectionIds(): Promise<string[]> {
    const targets = await this.reader.syncTargets({
      kinds: this.kinds(),
      limit: maxConnectionsPerRun,
    });
    return targets.map(({ connectionId }) => connectionId);
  }

  async connectionIdsOf(props: { userId: string }): Promise<string[]> {
    const targets = await this.reader.syncTargets({
      connectedBy: props.userId,
      kinds: this.kinds(),
      limit: maxConnectionsPerPerson,
    });
    return targets.map(({ connectionId }) => connectionId);
  }

  async syncConnection(props: { connectionId: string }): Promise<SyncOutcome> {
    const [target] = await this.reader.syncTargets({
      connectionId: props.connectionId,
      kinds: this.kinds(),
      limit: 1,
    });
    const source = this.sources.find(({ kind }) => kind === target?.kind);
    if (target === undefined || source === undefined) {
      return { status: 'skipped' };
    }

    const attemptedAt = new Date();
    try {
      if (target.suspended) {
        throw new InstallationSuspendedError();
      }
      const snapshot = await source.read(target);
      const { applied } = await this.writer.replace({
        connectionId: target.connectionId,
        viewerLogin: snapshot.viewerLogin,
        records: snapshot.records,
        truncated: snapshot.truncated,
        syncedAt: attemptedAt,
      });
      return { status: applied ? 'synced' : 'stale' };
    } catch (thrown) {
      const error =
        thrown instanceof Error ? thrown : new Error('A non-error was thrown');
      await this.writer.recordFailure({
        connectionId: target.connectionId,
        error: SourcedGithubReconcile.describe(error),
        attemptedAt,
      });
      return { status: 'failed', error: this.errorDescriber.describe(error) };
    }
  }

  private kinds(): ConnectionKind[] {
    return this.sources.map(({ kind }) => kind);
  }

  /** What the feed shows. Only Dash's own messages pass through; a provider's error could carry request details. */
  private static describe(error: Error): string {
    if (
      error instanceof ViewerNotLinkedError ||
      error instanceof InstallationSuspendedError
    ) {
      return error.message;
    }
    if (
      error instanceof ConnectionNotReadableError ||
      error instanceof ConnectorUnknownError
    ) {
      return 'This connection can’t be read until it is reconnected.';
    }
    const status = statusSchema.safeParse(error);
    return status.success
      ? `GitHub answered ${status.data.status}. Dash tries again at the next sync.`
      : 'Reading GitHub failed. Dash tries again at the next sync.';
  }
}
