import type {
  GithubAssignmentRecord,
  GithubCheckRollupRecord,
  GithubIssueRecord,
  GithubPullRequestRecord,
  GithubReleaseRecord,
  GithubRepositoryRecord,
  GithubReviewRequestRecord,
  GithubWorkflowRunRecord,
} from '#src/github-feed/contracts/github-records.ts';
import type {
  githubAssignmentTable,
  githubCheckRollupTable,
  githubIssueTable,
  githubPullRequestTable,
  githubReleaseTable,
  githubRepoTable,
  githubReviewRequestTable,
  githubWorkflowRunTable,
} from '#src/github-feed/repositories/github-records/github-records-table.ts';

/** Stored rows read back as records, without the connection and read stamp the tables add. */
export class GithubRecordRows {
  static repository(
    row: typeof githubRepoTable.$inferSelect,
  ): GithubRepositoryRecord {
    return {
      nodeId: row.nodeId,
      fullName: row.fullName,
      url: row.url,
      defaultBranch: row.defaultBranch,
      archived: row.archived,
    };
  }

  static pullRequest(
    row: typeof githubPullRequestTable.$inferSelect,
  ): GithubPullRequestRecord {
    return {
      nodeId: row.nodeId,
      repositoryNodeId: row.repositoryNodeId,
      number: row.number,
      title: row.title,
      url: row.url,
      state: row.state,
      draft: row.draft,
      mergeable: row.mergeable,
      mergeState: row.mergeState,
      reviewDecision: row.reviewDecision,
      author: row.author,
      headRef: row.headRef,
      headSha: row.headSha,
      mergedAt: row.mergedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  static release(
    row: typeof githubReleaseTable.$inferSelect,
  ): GithubReleaseRecord {
    return {
      nodeId: row.nodeId,
      repositoryNodeId: row.repositoryNodeId,
      tagName: row.tagName,
      name: row.name,
      url: row.url,
      author: row.author,
      prerelease: row.prerelease,
      publishedAt: row.publishedAt.toISOString(),
    };
  }

  static reviewRequest(
    row: typeof githubReviewRequestTable.$inferSelect,
  ): GithubReviewRequestRecord {
    return {
      pullRequestNodeId: row.pullRequestNodeId,
      reviewerKind: row.reviewerKind,
      reviewer: row.reviewer,
    };
  }

  static checkRollup(
    row: typeof githubCheckRollupTable.$inferSelect,
  ): GithubCheckRollupRecord {
    return {
      pullRequestNodeId: row.pullRequestNodeId,
      headSha: row.headSha,
      state: row.state,
      successCount: row.successCount,
      failureCount: row.failureCount,
      pendingCount: row.pendingCount,
    };
  }

  static workflowRun(
    row: typeof githubWorkflowRunTable.$inferSelect,
  ): GithubWorkflowRunRecord {
    return {
      nodeId: row.nodeId,
      repositoryNodeId: row.repositoryNodeId,
      pullRequestNodeId: row.pullRequestNodeId,
      workflowName: row.workflowName,
      runNumber: row.runNumber,
      branch: row.branch,
      headSha: row.headSha,
      event: row.event,
      conclusion: row.conclusion,
      url: row.url,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  static issue(row: typeof githubIssueTable.$inferSelect): GithubIssueRecord {
    return {
      nodeId: row.nodeId,
      repositoryNodeId: row.repositoryNodeId,
      number: row.number,
      title: row.title,
      url: row.url,
      author: row.author,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  static assignment(
    row: typeof githubAssignmentTable.$inferSelect,
  ): GithubAssignmentRecord {
    return {
      subjectNodeId: row.subjectNodeId,
      subjectKind: row.subjectKind,
      login: row.login,
      role: row.role,
    };
  }
}
