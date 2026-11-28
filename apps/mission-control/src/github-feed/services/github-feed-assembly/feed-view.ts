import type {
  GithubFeedDefaultBranch,
  GithubFeedIssue,
  GithubFeedMyPullRequest,
  GithubFeedPullRequest,
  GithubFeedRelease,
  GithubFeedRun,
} from '#src/github-feed/contracts/github-feed.ts';
import type {
  GithubCheckRecord,
  GithubIssueRecord,
  GithubPullRequestRecord,
  GithubRecords,
  GithubReleaseRecord,
  GithubRepositoryRecord,
} from '#src/github-feed/contracts/github-records.ts';
import type { ConnectionRecords } from '#src/github-feed/repositories/github-records/github-record-reader.ts';

/** One connection's rows as feed items, each with its repository and its link on GitHub. */
export class FeedView {
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
      closingIssues: record.closingIssues,
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

  myPullRequest(record: GithubPullRequestRecord): GithubFeedMyPullRequest {
    const checks = this.records.checks.filter(
      (check) =>
        check.subjectNodeId === record.nodeId &&
        check.headSha === record.headSha,
    );
    const rollup = this.records.checkRollups.find(
      (candidate) =>
        candidate.pullRequestNodeId === record.nodeId &&
        candidate.headSha === record.headSha,
    );
    return {
      ...this.pullRequest(record),
      failingChecks: checks
        .filter(({ state }) => state === 'failure')
        .map(({ name, url }) => ({ name, url })),
      checkCount:
        rollup === undefined
          ? 0
          : rollup.successCount + rollup.failureCount + rollup.pendingCount,
    };
  }

  /** Every default branch whose head was read, with the checks of that head. */
  defaultBranches(): GithubFeedDefaultBranch[] {
    return this.records.repositories.flatMap((repository) => {
      const { defaultBranch, defaultBranchHeadSha: headSha } = repository;
      if (defaultBranch === null || headSha === null) {
        return [];
      }
      return [
        {
          repository: { fullName: repository.fullName, url: repository.url },
          branch: defaultBranch,
          headSha,
          state: repository.defaultBranchState,
          checksTruncated: repository.defaultBranchChecksTruncated,
          checks: this.records.checks
            .filter(
              (check) =>
                check.subjectKind === 'default_branch' &&
                check.subjectNodeId === repository.nodeId &&
                check.headSha === headSha,
            )
            .toSorted(FeedView.failingFirst)
            .map((check) => ({
              name: check.name,
              kind: check.kind,
              app: check.app,
              state: check.state,
              url: check.url,
              failingSince: check.failingSince,
            })),
        },
      ];
    });
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

  private static failingFirst(
    left: GithubCheckRecord,
    right: GithubCheckRecord,
  ): number {
    const failing = (check: GithubCheckRecord) =>
      check.state === 'failure' ? 0 : 1;
    return (
      failing(left) - failing(right) || left.name.localeCompare(right.name)
    );
  }
}
