import type {
  ConnectionKind,
  GithubRecords,
} from '#src/github-feed/contracts/github-records.ts';

/** A GitHub connection as a source reads it. `owned` ones carry their installation; `guest` ones will carry a personal token instead. */
export interface GithubSyncTarget {
  connectionId: string;
  kind: ConnectionKind;
  installationId: string | null;
  account: { login: string; kind: 'organization' | 'user' };
  connectedBy: string | null;
  suspended: boolean;
  repositories: readonly string[];
}

/** One read of a connection, for the person it was read for. */
export interface GithubSnapshot {
  viewerLogin: string;
  records: GithubRecords;
  truncated: boolean;
}

/**
 * Reads one kind of GitHub connection. Every source returns the same records, so the feed
 * never depends on whether a row came from an installation or a personal token.
 */
export interface GithubSource {
  readonly kind: ConnectionKind;
  read(target: GithubSyncTarget): Promise<GithubSnapshot>;
}
