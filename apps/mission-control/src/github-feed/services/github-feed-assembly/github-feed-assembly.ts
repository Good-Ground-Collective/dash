import type {
  GithubFeed,
  GithubFeedDefaultBranch,
} from '#src/github-feed/contracts/github-feed.ts';
import type { ConnectionRecords } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import { FeedView } from '#src/github-feed/services/github-feed-assembly/feed-view.ts';

interface Item {
  id: string;
}

/**
 * The feed's groups, built from stored rows. It reads every connection the same way,
 * whatever its kind, and filters by the login each connection was read for. An item two
 * connections both see appears once.
 */
export class GithubFeedAssembly {
  static assemble(connections: readonly ConnectionRecords[]): GithubFeed {
    const groups = connections.map((connection) =>
      GithubFeedAssembly.groupsOf(connection),
    );
    return {
      connections: connections.map((connection) => ({
        id: connection.connectionId,
        accountLogin: connection.accountLogin,
        kind: connection.kind,
        lastSyncedAt: connection.lastSyncedAt,
        lastError: connection.lastError,
        truncated: connection.truncated,
      })),
      reviewRequests: GithubFeedAssembly.newest({
        items: groups.flatMap((group) => group.reviewRequests),
        timeOf: ({ updatedAt }) => updatedAt,
      }),
      myPullRequests: GithubFeedAssembly.newest({
        items: groups.flatMap((group) => group.myPullRequests),
        timeOf: ({ updatedAt }) => updatedAt,
      }),
      recentMerges: GithubFeedAssembly.newest({
        items: groups.flatMap((group) => group.recentMerges),
        timeOf: ({ mergedAt }) => mergedAt ?? '',
      }),
      releases: GithubFeedAssembly.newest({
        items: groups.flatMap((group) => group.releases),
        timeOf: ({ publishedAt }) => publishedAt,
      }),
      failedRuns: GithubFeedAssembly.newest({
        items: groups.flatMap((group) => group.failedRuns),
        timeOf: ({ updatedAt }) => updatedAt,
      }),
      defaultBranches: GithubFeedAssembly.byRepository(
        groups.flatMap((group) => group.defaultBranches),
      ),
      assignedIssues: GithubFeedAssembly.newest({
        items: groups.flatMap((group) => group.assignedIssues),
        timeOf: ({ updatedAt }) => updatedAt,
      }),
    };
  }

  private static groupsOf(connection: ConnectionRecords) {
    const { records, viewerLogin } = connection;
    const me = viewerLogin?.toLowerCase() ?? null;
    const assigned = (role: 'review_requested' | 'assignee') =>
      new Set(
        records.assignments
          .filter(
            (assignment) =>
              assignment.role === role && assignment.login.toLowerCase() === me,
          )
          .map((assignment) => assignment.subjectNodeId),
      );
    const requested = assigned('review_requested');
    const mine = assigned('assignee');
    const view = new FeedView({ connection });

    const open = records.pullRequests.filter(
      (pullRequest) => pullRequest.state === 'open',
    );

    return {
      reviewRequests: open
        .filter((pullRequest) => requested.has(pullRequest.nodeId))
        .map((pullRequest) => view.pullRequest(pullRequest)),
      myPullRequests: open
        .filter((pullRequest) => pullRequest.author?.toLowerCase() === me)
        .map((pullRequest) => view.myPullRequest(pullRequest)),
      recentMerges: records.pullRequests
        .filter(
          (pullRequest) =>
            pullRequest.state === 'merged' &&
            pullRequest.mergedAt !== null &&
            pullRequest.author?.toLowerCase() === me,
        )
        .map((pullRequest) => view.pullRequest(pullRequest)),
      releases: records.releases.map((release) => view.release(release)),
      failedRuns: records.workflowRuns.map((run) => view.run(run)),
      defaultBranches: view.defaultBranches(),
      assignedIssues: records.issues
        .filter((issue) => mine.has(issue.nodeId))
        .map((issue) => view.issue(issue)),
    };
  }

  /** A repository two connections both read appears once, by the first. */
  private static byRepository(
    branches: readonly GithubFeedDefaultBranch[],
  ): GithubFeedDefaultBranch[] {
    const unique = new Map<string, GithubFeedDefaultBranch>();
    for (const branch of branches) {
      if (!unique.has(branch.repository.fullName)) {
        unique.set(branch.repository.fullName, branch);
      }
    }
    return [...unique.values()].toSorted((left, right) =>
      left.repository.fullName.localeCompare(right.repository.fullName),
    );
  }

  private static newest<T extends Item>(props: {
    items: readonly T[];
    timeOf: (item: T) => string;
  }): T[] {
    const unique = new Map<string, T>();
    for (const item of props.items) {
      if (!unique.has(item.id)) {
        unique.set(item.id, item);
      }
    }
    return [...unique.values()].toSorted((left, right) =>
      props.timeOf(right).localeCompare(props.timeOf(left)),
    );
  }
}
