import type {
  ActivityIssue,
  ActivityPullRequest,
  ActivityRepository,
  ActivityRun,
} from '@dash/integrations-core';

import type {
  GithubDefaultBranchNode,
  GithubFailedSuite,
  GithubIssueNode,
  GithubPullRequestNode,
} from '#src/contracts/github-activity-response.ts';

type FailedSuite = NonNullable<GithubFailedSuite>;

/** A default branch's repository and the runs that failed on its head commit. */
export interface DefaultBranchActivity {
  repository: ActivityRepository;
  runs: ActivityRun[];
}

/** GraphQL nodes read as provider-neutral activity records. */
export const githubActivityRecords = {
  run(props: {
    suite: FailedSuite;
    repositoryId: string;
    pullRequestId: string | null;
    branch: string;
    headSha: string;
  }): ActivityRun {
    const { suite } = props;
    return {
      provider: 'github',
      externalId: suite.id,
      url: suite.url,
      repositoryId: props.repositoryId,
      pullRequestId: props.pullRequestId,
      workflowName: suite.workflow.name,
      runNumber: suite.runNumber,
      branch: props.branch,
      headSha: props.headSha,
      event: suite.event,
      conclusion: suite.conclusion,
      updatedAt: suite.updatedAt,
    };
  },

  pullRequest(node: GithubPullRequestNode): ActivityPullRequest {
    const commit = node.commits.nodes.at(-1)?.commit;
    return {
      provider: 'github',
      externalId: node.id,
      url: node.url,
      repositoryId: node.repository.externalId,
      number: node.number,
      title: node.title,
      author: node.author?.login ?? null,
      state: node.state,
      draft: node.isDraft,
      mergeable: node.mergeable,
      reviewDecision: node.reviewDecision,
      headRef: node.headRefName,
      headSha: node.headRefOid,
      requestedReviewers: node.reviewRequests.nodes.flatMap(
        ({ requestedReviewer }) =>
          requestedReviewer === null ? [] : [requestedReviewer],
      ),
      checks: commit?.statusCheckRollup ?? null,
      updatedAt: node.updatedAt,
    };
  },

  pullRequestRuns(node: GithubPullRequestNode): ActivityRun[] {
    const suites = node.commits.nodes.at(-1)?.commit.checkSuites.nodes ?? [];
    return suites.flatMap((suite) =>
      suite === null
        ? []
        : [
            githubActivityRecords.run({
              suite,
              repositoryId: node.repository.externalId,
              pullRequestId: node.id,
              branch: node.headRefName,
              headSha: node.headRefOid,
            }),
          ],
    );
  },

  issue(node: GithubIssueNode): ActivityIssue {
    return {
      provider: 'github',
      externalId: node.id,
      url: node.url,
      repositoryId: node.repository.externalId,
      number: node.number,
      title: node.title,
      author: node.author?.login ?? null,
      assignees: node.assignees.nodes.map(({ login }) => login),
      updatedAt: node.updatedAt,
    };
  },

  defaultBranch(
    node: NonNullable<GithubDefaultBranchNode>,
  ): DefaultBranchActivity {
    const branch = node.defaultBranchRef;
    const repository: ActivityRepository = {
      provider: 'github',
      externalId: node.id,
      url: node.url,
      fullName: node.nameWithOwner,
      defaultBranch: branch?.name ?? null,
      archived: node.isArchived,
    };
    const headSha = branch?.target?.oid;
    if (branch === null || headSha === undefined) {
      return { repository, runs: [] };
    }

    const suites = branch.target?.checkSuites?.nodes ?? [];
    return {
      repository,
      runs: suites.flatMap((suite) =>
        suite === null
          ? []
          : [
              githubActivityRecords.run({
                suite,
                repositoryId: node.id,
                pullRequestId: null,
                branch: branch.name,
                headSha,
              }),
            ],
      ),
    };
  },
};
