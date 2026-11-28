import type {
  ConnectionKind,
  GithubRecords,
  GithubReleaseRead,
} from '#src/github-feed/contracts/github-records.ts';
import type { GithubSyncTarget } from '#src/github-feed/contracts/github-source.ts';
import { recentActivityRetentionMs } from '#src/github-feed/definitions/feed-retention/feed-retention.ts';
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
  truncated: boolean | null;
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
    kinds: readonly ConnectionKind[];
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
            target.connectedBy === props.connectedBy) &&
          props.kinds.includes(target.kind),
      )
      .toSorted((left, right) => attempted(left) - attempted(right))
      .slice(0, props.limit);
  }

  async staleSyncs(props: {
    before: Date;
    kinds: readonly ConnectionKind[];
    limit: number;
  }): Promise<{ connectionId: string; lastSyncedAt: Date }[]> {
    return this.targets
      .filter(
        (target) => props.kinds.includes(target.kind) && !target.suspended,
      )
      .flatMap((target) => {
        const lastSyncedAt = this.syncs.get(target.connectionId)?.lastSyncedAt;
        return lastSyncedAt != null && lastSyncedAt < props.before
          ? [{ connectionId: target.connectionId, lastSyncedAt }]
          : [];
      })
      .toSorted(
        (left, right) =>
          left.lastSyncedAt.getTime() - right.lastSyncedAt.getTime(),
      )
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
          truncated: sync?.truncated ?? null,
          records: sync?.records ?? InMemoryGithubRecords.empty(),
        };
      });
  }

  async replace(props: {
    connectionId: string;
    viewerLogin: string;
    records: GithubRecords;
    releaseReads: readonly GithubReleaseRead[];
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
    const triedLater =
      stored !== undefined && stored.lastAttemptedAt > props.syncedAt;
    this.syncs.set(props.connectionId, {
      viewerLogin: props.viewerLogin,
      lastSyncedAt: props.syncedAt,
      lastAttemptedAt: triedLater ? stored.lastAttemptedAt : props.syncedAt,
      lastError: triedLater ? stored.lastError : null,
      truncated: props.truncated,
      records: InMemoryGithubRecords.withRetained({
        read: props.records,
        releaseReads: props.releaseReads,
        stored: stored?.records ?? null,
        now: props.syncedAt,
      }),
    });
    return { applied: true };
  }

  async recordFailure(props: {
    connectionId: string;
    error: string;
    attemptedAt: Date;
  }): Promise<void> {
    const stored = this.syncs.get(props.connectionId);
    if (
      stored?.lastSyncedAt !== null &&
      stored?.lastSyncedAt !== undefined &&
      stored.lastSyncedAt > props.attemptedAt
    ) {
      return;
    }
    const attemptedAt = Math.max(
      stored?.lastAttemptedAt.getTime() ?? 0,
      props.attemptedAt.getTime(),
    );
    this.syncs.set(props.connectionId, {
      viewerLogin: stored?.viewerLogin ?? null,
      lastSyncedAt: stored?.lastSyncedAt ?? null,
      lastAttemptedAt: new Date(attemptedAt),
      lastError: props.error,
      truncated: stored?.truncated ?? null,
      records: stored?.records ?? null,
    });
  }

  static empty(): GithubRecords {
    return {
      repositories: [],
      pullRequests: [],
      releases: [],
      reviewRequests: [],
      checkRollups: [],
      checks: [],
      workflowRuns: [],
      issues: [],
      assignments: [],
    };
  }

  /** A check keeps the time it first failed only across consecutive failing reads; a pending, success, neutral or skipped read clears it. As the table's upsert does. */
  private static withFailingSince(props: {
    read: GithubRecords['checks'];
    stored: GithubRecords['checks'];
    now: Date;
  }): GithubRecords['checks'] {
    const key = (check: GithubRecords['checks'][number]) =>
      `${check.subjectNodeId}:${check.name}`;
    const failingBefore = new Map(
      props.stored
        .filter((check) => check.state === 'failure')
        .map((check) => [key(check), check.failingSince]),
    );
    return props.read.map((check) => ({
      ...check,
      failingSince:
        check.state === 'failure'
          ? (failingBefore.get(key(check)) ?? props.now.toISOString())
          : null,
    }));
  }

  /** What a read found plus the merged pull requests and releases from before it that are still within their retention. */
  private static withRetained(props: {
    read: GithubRecords;
    releaseReads: readonly GithubReleaseRead[];
    stored: GithubRecords | null;
    now: Date;
  }): GithubRecords {
    const since = new Date(
      props.now.getTime() - recentActivityRetentionMs,
    ).toISOString();
    const readPullRequests = new Set(
      props.read.pullRequests.map(({ nodeId }) => nodeId),
    );
    const readReleases = new Set(
      props.read.releases.map(({ nodeId }) => nodeId),
    );
    const merged = (record: GithubRecords['pullRequests'][number]) =>
      record.state === 'merged' &&
      record.mergedAt !== null &&
      record.mergedAt >= since;
    const published = (record: GithubRecords['releases'][number]) =>
      record.publishedAt >= since;
    const unreported = (record: GithubRecords['releases'][number]) =>
      props.releaseReads.some(
        (read) =>
          read.repositoryNodeId === record.repositoryNodeId &&
          (read.exhaustive ||
            (read.oldestPublishedAt !== null &&
              Date.parse(record.publishedAt) >=
                Date.parse(read.oldestPublishedAt))),
      );

    return {
      ...props.read,
      checks: InMemoryGithubRecords.withFailingSince({
        read: props.read.checks,
        stored: props.stored?.checks ?? [],
        now: props.now,
      }),
      pullRequests: [
        ...props.read.pullRequests.filter(
          (record) => record.state !== 'merged' || merged(record),
        ),
        ...(props.stored?.pullRequests ?? []).filter(
          (record) => !readPullRequests.has(record.nodeId) && merged(record),
        ),
      ],
      releases: [
        ...props.read.releases.filter(published),
        ...(props.stored?.releases ?? []).filter(
          (record) =>
            !readReleases.has(record.nodeId) &&
            published(record) &&
            !unreported(record),
        ),
      ],
    };
  }
}
