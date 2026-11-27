import type {
  GithubAssignmentRecord,
  GithubCheckRollupRecord,
  GithubIssueRecord,
  GithubPullRequestRecord,
  GithubRepositoryRecord,
  GithubReviewRequestRecord,
  GithubWorkflowRunRecord,
} from '#src/github-feed/contracts/github-records.ts';
import type {
  githubAssignmentTable,
  githubCheckRollupTable,
  githubIssueTable,
  githubPullRequestTable,
  githubRepoTable,
  githubReviewRequestTable,
  githubWorkflowRunTable,
} from '#src/github-feed/repositories/github-records/github-records-table.ts';

/** Stored rows read back as records, without the connection and read stamp the tables add. */
export const githubRecordRows = {
  repository(row: typeof githubRepoTable.$inferSelect): GithubRepositoryRecord {
    return {
      nodeId: row.nodeId,
      fullName: row.fullName,
      url: row.url,
      defaultBranch: row.defaultBranch,
      archived: row.archived,
    };
  },

  pullRequest(
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
      reviewDecision: row.reviewDecision,
      author: row.author,
      headRef: row.headRef,
      headSha: row.headSha,
      updatedAt: row.updatedAt.toISOString(),
    };
  },

  reviewRequest(
    row: typeof githubReviewRequestTable.$inferSelect,
  ): GithubReviewRequestRecord {
    return {
      pullRequestNodeId: row.pullRequestNodeId,
      reviewerKind: row.reviewerKind,
      reviewer: row.reviewer,
    };
  },

  checkRollup(
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
  },

  workflowRun(
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
  },

  issue(row: typeof githubIssueTable.$inferSelect): GithubIssueRecord {
    return {
      nodeId: row.nodeId,
      repositoryNodeId: row.repositoryNodeId,
      number: row.number,
      title: row.title,
      url: row.url,
      author: row.author,
      updatedAt: row.updatedAt.toISOString(),
    };
  },

  assignment(
    row: typeof githubAssignmentTable.$inferSelect,
  ): GithubAssignmentRecord {
    return {
      subjectNodeId: row.subjectNodeId,
      subjectKind: row.subjectKind,
      login: row.login,
      role: row.role,
    };
  },
};
