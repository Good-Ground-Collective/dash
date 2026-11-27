import type {
  GithubFeed,
  GithubFeedIssue,
  GithubFeedPullRequest,
  GithubFeedRun,
} from '#src/github-feed/contracts/github-feed.ts';
import type {
  GithubIssueRecord,
  GithubPullRequestRecord,
  GithubRecords,
  GithubRepositoryRecord,
} from '#src/github-feed/contracts/github-records.ts';
import type { ConnectionRecords } from '#src/github-feed/repositories/github-records/github-record-reader.ts';

interface Item {
  id: string;
  updatedAt: string;
}

/**
 * The feed's four groups, built from stored rows. It reads every connection the same way,
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
      reviewRequests: GithubFeedAssembly.newest(
        groups.flatMap((group) => group.reviewRequests),
      ),
      myPullRequests: GithubFeedAssembly.newest(
        groups.flatMap((group) => group.myPullRequests),
      ),
      failedRuns: GithubFeedAssembly.newest(
        groups.flatMap((group) => group.failedRuns),
      ),
      assignedIssues: GithubFeedAssembly.newest(
        groups.flatMap((group) => group.assignedIssues),
      ),
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

    return {
      reviewRequests: records.pullRequests
        .filter((pullRequest) => requested.has(pullRequest.nodeId))
        .map((pullRequest) => view.pullRequest(pullRequest)),
      myPullRequests: records.pullRequests
        .filter((pullRequest) => pullRequest.author?.toLowerCase() === me)
        .map((pullRequest) => view.pullRequest(pullRequest)),
      failedRuns: records.workflowRuns.map((run) => view.run(run)),
      assignedIssues: records.issues
        .filter((issue) => mine.has(issue.nodeId))
        .map((issue) => view.issue(issue)),
    };
  }

  private static newest<T extends Item>(items: readonly T[]): T[] {
    const unique = new Map<string, T>();
    for (const item of items) {
      if (!unique.has(item.id)) {
        unique.set(item.id, item);
      }
    }
    return [...unique.values()].toSorted((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
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
      number: record.number,
      title: record.title,
      author: record.author,
      state: record.state,
      draft: record.draft,
      mergeable: record.mergeable,
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

  /** A repository that went missing from a read still shows, by the URL's own path. */
  private item(record: {
    nodeId: string;
    repositoryNodeId: string;
    url: string;
    updatedAt: string;
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
      updatedAt: record.updatedAt,
    };
  }
}
