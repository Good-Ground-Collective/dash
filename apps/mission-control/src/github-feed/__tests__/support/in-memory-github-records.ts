import type { GithubRecords } from '#src/github-feed/contracts/github-records.ts';
import type { GithubSyncTarget } from '#src/github-feed/contracts/github-source.ts';
import type {
  ConnectionRecords,
  GithubRecordReader,
} from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import type { GithubRecordWriter } from '#src/github-feed/repositories/github-records/github-record-writer.ts';

interface StoredSync {
  viewerLogin: string | null;
  lastSyncedAt: Date | null;
  lastAttemptedAt: Date;
  lastError: string | null;
  records: GithubRecords | null;
}

/** Connections and their GitHub rows in memory, replaced whole on each read the way the tables are upserted and pruned. */
export class InMemoryGithubRecords
  implements GithubRecordReader, GithubRecordWriter
{
  readonly targets: GithubSyncTarget[] = [];
  readonly syncs = new Map<string, StoredSync>();

  add(target: GithubSyncTarget): this {
    this.targets.push(target);
    return this;
  }

  async syncTargets(props: {
    connectionId?: string;
    connectedBy?: string;
    limit: number;
  }): Promise<GithubSyncTarget[]> {
    const attempted = (target: GithubSyncTarget) =>
      this.syncs.get(target.connectionId)?.lastAttemptedAt.getTime() ?? -1;
    return this.targets
      .filter(
        (target) =>
          (props.connectionId === undefined ||
            target.connectionId === props.connectionId) &&
          (props.connectedBy === undefined ||
            target.connectedBy === props.connectedBy),
      )
      .toSorted((left, right) => attempted(left) - attempted(right))
      .slice(0, props.limit);
  }

  async recordsFor(props: {
    connectedBy: string;
  }): Promise<ConnectionRecords[]> {
    return this.targets
      .filter((target) => target.connectedBy === props.connectedBy)
      .map((target) => {
        const sync = this.syncs.get(target.connectionId);
        return {
          connectionId: target.connectionId,
          kind: target.kind,
          accountLogin: target.account.login,
          viewerLogin: sync?.viewerLogin ?? null,
          lastSyncedAt: sync?.lastSyncedAt?.toISOString() ?? null,
          lastError: sync?.lastError ?? null,
          records: sync?.records ?? InMemoryGithubRecords.empty(),
        };
      });
  }

  async replace(props: {
    connectionId: string;
    viewerLogin: string;
    records: GithubRecords;
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
      viewerLogin: props.viewerLogin,
      lastSyncedAt: props.syncedAt,
      lastAttemptedAt: props.syncedAt,
      lastError: null,
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
      viewerLogin: stored?.viewerLogin ?? null,
      lastSyncedAt: stored?.lastSyncedAt ?? null,
      lastAttemptedAt: props.attemptedAt,
      lastError: props.error,
      records: stored?.records ?? null,
    });
  }

  static empty(): GithubRecords {
    return {
      repositories: [],
      pullRequests: [],
      reviewRequests: [],
      checkRollups: [],
      workflowRuns: [],
      issues: [],
      assignments: [],
    };
  }
}
