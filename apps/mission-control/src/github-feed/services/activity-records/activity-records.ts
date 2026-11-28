import type {
  Activity,
  ActivityPullRequest,
  ActivityRelease,
} from '@dash/integrations-core';

import type {
  GithubAssignmentRecord,
  GithubCheckRollupRecord,
  GithubIssueRecord,
  GithubPullRequestRecord,
  GithubRecords,
  GithubReleaseRecord,
  GithubReviewRequestRecord,
  GithubWorkflowRunRecord,
} from '#src/github-feed/contracts/github-records.ts';

/**
 * A provider's activity read as the rows the GitHub tables keep. Duplicates collapse on
 * their keys, so one read never writes the same row twice. A review request found by the
 * viewer's search is assigned to the viewer even when it reached them through a team.
 */
export class ActivityRecords {
  static from(props: {
    activity: Activity;
    viewerLogin: string;
  }): GithubRecords {
    const { activity, viewerLogin } = props;
    const pullRequests = ActivityRecords.unique(
      [
        ...activity.reviewRequests,
        ...activity.authoredPullRequests,
        ...activity.mergedPullRequests,
      ],
      (pullRequest) => pullRequest.externalId,
    );

    return {
      repositories: ActivityRecords.unique(
        activity.repositories.map((repository) => ({
          nodeId: repository.externalId,
          fullName: repository.fullName,
          url: repository.url,
          defaultBranch: repository.defaultBranch,
          archived: repository.archived,
        })),
        (repository) => repository.nodeId,
      ),
      pullRequests: pullRequests.map((pullRequest) =>
        ActivityRecords.pullRequest(pullRequest),
      ),
      releases: ActivityRecords.unique(
        activity.releases.map((release) => ActivityRecords.release(release)),
        (release) => release.nodeId,
      ),
      reviewRequests: ActivityRecords.unique(
        pullRequests.flatMap((pullRequest) =>
          ActivityRecords.reviewRequests(pullRequest),
        ),
        (request) =>
          `${request.pullRequestNodeId}:${request.reviewerKind}:${request.reviewer}`,
      ),
      checkRollups: pullRequests.flatMap((pullRequest) =>
        ActivityRecords.checkRollup(pullRequest),
      ),
      workflowRuns: ActivityRecords.workflowRuns(activity),
      issues: ActivityRecords.issues(activity),
      assignments: ActivityRecords.assignments({ activity, viewerLogin }),
    };
  }

  private static assignments(props: {
    activity: Activity;
    viewerLogin: string;
  }): GithubAssignmentRecord[] {
    const { activity, viewerLogin } = props;
    const requested = activity.reviewRequests.map(
      (pullRequest): GithubAssignmentRecord => ({
        subjectNodeId: pullRequest.externalId,
        subjectKind: 'pull_request',
        login: viewerLogin,
        role: 'review_requested',
      }),
    );
    const assigned = activity.assignedIssues.flatMap((issue) =>
      issue.assignees.map((login): GithubAssignmentRecord => ({
        subjectNodeId: issue.externalId,
        subjectKind: 'issue',
        login,
        role: 'assignee',
      })),
    );
    return ActivityRecords.unique(
      [...requested, ...assigned],
      (assignment) =>
        `${assignment.subjectNodeId}:${assignment.login}:${assignment.role}`,
    );
  }

  private static workflowRuns(activity: Activity): GithubWorkflowRunRecord[] {
    return ActivityRecords.unique(
      activity.failedRuns.map((run) => ({
        nodeId: run.externalId,
        repositoryNodeId: run.repositoryId,
        pullRequestNodeId: run.pullRequestId,
        workflowName: run.workflowName,
        runNumber: run.runNumber,
        branch: run.branch,
        headSha: run.headSha,
        event: run.event,
        conclusion: run.conclusion,
        url: run.url,
        updatedAt: new Date(run.updatedAt).toISOString(),
      })),
      (run) => run.nodeId,
    );
  }

  private static issues(activity: Activity): GithubIssueRecord[] {
    return ActivityRecords.unique(
      activity.assignedIssues.map((issue) => ({
        nodeId: issue.externalId,
        repositoryNodeId: issue.repositoryId,
        number: issue.number,
        title: issue.title,
        url: issue.url,
        author: issue.author,
        updatedAt: new Date(issue.updatedAt).toISOString(),
      })),
      (issue) => issue.nodeId,
    );
  }

  private static pullRequest(
    pullRequest: ActivityPullRequest,
  ): GithubPullRequestRecord {
    return {
      nodeId: pullRequest.externalId,
      repositoryNodeId: pullRequest.repositoryId,
      number: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      state: pullRequest.state,
      draft: pullRequest.draft,
      mergeable: pullRequest.mergeable,
      reviewDecision: pullRequest.reviewDecision,
      author: pullRequest.author,
      headRef: pullRequest.headRef,
      headSha: pullRequest.headSha,
      mergedAt:
        pullRequest.mergedAt === null
          ? null
          : new Date(pullRequest.mergedAt).toISOString(),
      updatedAt: new Date(pullRequest.updatedAt).toISOString(),
    };
  }

  private static release(release: ActivityRelease): GithubReleaseRecord {
    return {
      nodeId: release.externalId,
      repositoryNodeId: release.repositoryId,
      tagName: release.tagName,
      name: release.name,
      url: release.url,
      author: release.author,
      prerelease: release.prerelease,
      publishedAt: new Date(release.publishedAt).toISOString(),
    };
  }

  private static reviewRequests(
    pullRequest: ActivityPullRequest,
  ): GithubReviewRequestRecord[] {
    return pullRequest.requestedReviewers.map((reviewer) => ({
      pullRequestNodeId: pullRequest.externalId,
      reviewerKind: reviewer.kind,
      reviewer: reviewer.name,
    }));
  }

  private static checkRollup(
    pullRequest: ActivityPullRequest,
  ): GithubCheckRollupRecord[] {
    const { checks } = pullRequest;
    return checks === null
      ? []
      : [
          {
            pullRequestNodeId: pullRequest.externalId,
            headSha: pullRequest.headSha,
            state: checks.state,
            successCount: checks.success,
            failureCount: checks.failure,
            pendingCount: checks.pending,
          },
        ];
  }

  private static unique<T>(items: readonly T[], key: (item: T) => string): T[] {
    return [...new Map(items.map((item) => [key(item), item])).values()];
  }
}
