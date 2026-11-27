import { z } from 'zod';

import type {
  GithubSource,
  GithubSyncTarget,
} from '#src/github-feed/contracts/github-source.ts';
import {
  InstallationSuspendedError,
  ViewerNotLinkedError,
} from '#src/github-feed/errors.ts';
import type { GithubRecordReader } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import type { GithubRecordWriter } from '#src/github-feed/repositories/github-records/github-record-writer.ts';

/** The most connections one scheduled run reads. The least recently tried go first, so all of them take turns. */
const maxConnectionsPerRun = 50;
const maxConnectionsPerPerson = 20;

const statusSchema = z.object({ status: z.int() });

export type SyncOutcome =
  | { status: 'synced' | 'skipped' | 'stale' }
  | { status: 'failed'; error: string };

/**
 * Keeps stored GitHub rows in step with GitHub: reads each connection through the source
 * for its kind and replaces what the last read stored. A failed read is recorded on the
 * connection and keeps the previous rows, so the feed shows them as stale instead of empty.
 */
export class GithubReconcile {
  private readonly sources: readonly GithubSource[];
  private readonly reader: GithubRecordReader;
  private readonly writer: GithubRecordWriter;

  constructor(props: {
    sources: readonly GithubSource[];
    reader: GithubRecordReader;
    writer: GithubRecordWriter;
  }) {
    this.sources = props.sources;
    this.reader = props.reader;
    this.writer = props.writer;
  }

  async dueConnectionIds(): Promise<string[]> {
    const targets = await this.reader.syncTargets({
      limit: maxConnectionsPerRun,
    });
    return this.readable(targets);
  }

  async connectionIdsOf(props: { userId: string }): Promise<string[]> {
    const targets = await this.reader.syncTargets({
      connectedBy: props.userId,
      limit: maxConnectionsPerPerson,
    });
    return this.readable(targets);
  }

  async syncConnection(props: { connectionId: string }): Promise<SyncOutcome> {
    const [target] = await this.reader.syncTargets({
      connectionId: props.connectionId,
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
        syncedAt: attemptedAt,
      });
      return { status: applied ? 'synced' : 'stale' };
    } catch (thrown) {
      const error =
        thrown instanceof Error ? thrown : new Error('A non-error was thrown');
      await this.writer.recordFailure({
        connectionId: target.connectionId,
        error: GithubReconcile.describe(error),
        attemptedAt,
      });
      return { status: 'failed', error: `${error.name}: ${error.message}` };
    }
  }

  private readable(targets: readonly GithubSyncTarget[]): string[] {
    return targets
      .filter((target) => this.sources.some(({ kind }) => kind === target.kind))
      .map((target) => target.connectionId);
  }

  /** What the feed shows. Only Dash's own messages pass through; a provider's error could carry request details. */
  private static describe(error: Error): string {
    if (
      error instanceof ViewerNotLinkedError ||
      error instanceof InstallationSuspendedError
    ) {
      return error.message;
    }
    const status = statusSchema.safeParse(error);
    return status.success
      ? `GitHub answered ${status.data.status}. Dash tries again at the next sync.`
      : 'Reading GitHub failed. Dash tries again at the next sync.';
  }
}
