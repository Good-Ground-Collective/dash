import type {
  GithubFeed,
  GithubFeedIssue,
  GithubFeedPullRequest,
  GithubFeedRelease,
  GithubFeedRun,
} from '#src/github-feed/contracts/github-feed.ts';
import type {
  GithubIssueRecord,
  GithubPullRequestRecord,
  GithubRecords,
  GithubReleaseRecord,
  GithubRepositoryRecord,
} from '#src/github-feed/contracts/github-records.ts';
import type { ConnectionRecords } from '#src/github-feed/repositories/github-records/github-record-reader.ts';

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
        .map((pullRequest) => view.pullRequest(pullRequest)),
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
      assignedIssues: records.issues
        .filter((issue) => mine.has(issue.nodeId))
        .map((issue) => view.issue(issue)),
    };
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

/** One connection's rows as feed items, each with its repository and its link on GitHub. */
class FeedView {
  private readonly connectionId: string;
  private readonly records: GithubRecords;
  private readonly repositories: ReadonlyMap<string, GithubRepositoryRecord>;

  constructor(props: { connection: ConnectionRecords }) {
    this.connectionId = props.connection.connectionId;
    this.records = props.connection.records;
    this.repositories = new Map(
      this.records.repositories.map((repository) => [
        repository.nodeId,
        repository,
      ]),
    );
  }

  pullRequest(record: GithubPullRequestRecord): GithubFeedPullRequest {
    const checks = this.records.checkRollups.find(
      (rollup) =>
        rollup.pullRequestNodeId === record.nodeId &&
        rollup.headSha === record.headSha,
    );
    return {
      ...this.item(record),
      updatedAt: record.updatedAt,
      mergedAt: record.mergedAt,
      createdAt: record.createdAt,
      number: record.number,
      title: record.title,
      author: record.author,
      state: record.state,
      draft: record.draft,
      mergeable: record.mergeable,
      mergeState: record.mergeState,
      reviewDecision: record.reviewDecision,
      headSha: record.headSha,
      requestedReviewers: this.records.reviewRequests
        .filter((request) => request.pullRequestNodeId === record.nodeId)
        .map((request) => ({
          kind: request.reviewerKind,
          name: request.reviewer,
        })),
      checks:
        checks === undefined
          ? null
          : {
              state: checks.state,
              success: checks.successCount,
              failure: checks.failureCount,
              pending: checks.pendingCount,
            },
    };
  }

  run(record: GithubRecords['workflowRuns'][number]): GithubFeedRun {
    return {
      ...this.item(record),
      updatedAt: record.updatedAt,
      workflowName: record.workflowName,
      runNumber: record.runNumber,
      branch: record.branch,
      headSha: record.headSha,
      event: record.event,
      conclusion: record.conclusion,
      pullRequestId: record.pullRequestNodeId,
    };
  }

  issue(record: GithubIssueRecord): GithubFeedIssue {
    return {
      ...this.item(record),
      updatedAt: record.updatedAt,
      number: record.number,
      title: record.title,
      author: record.author,
      assignees: this.records.assignments
        .filter(
          (assignment) =>
            assignment.subjectNodeId === record.nodeId &&
            assignment.role === 'assignee',
        )
        .map((assignment) => assignment.login),
    };
  }

  release(record: GithubReleaseRecord): GithubFeedRelease {
    return {
      ...this.item(record),
      tagName: record.tagName,
      name: record.name,
      author: record.author,
      prerelease: record.prerelease,
      publishedAt: record.publishedAt,
    };
  }

  /** A repository that went missing from a read still shows, by the URL's own path. */
  private item(record: {
    nodeId: string;
    repositoryNodeId: string;
    url: string;
  }) {
    const repository = this.repositories.get(record.repositoryNodeId);
    const [, owner = '', name = ''] = new URL(record.url).pathname.split('/');
    return {
      id: record.nodeId,
      connectionId: this.connectionId,
      repository: {
        fullName: repository?.fullName ?? `${owner}/${name}`,
        url: repository?.url ?? `https://github.com/${owner}/${name}`,
      },
      url: record.url,
    };
  }
}
