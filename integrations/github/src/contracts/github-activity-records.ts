import type {
  ActivityIssue,
  ActivityPullRequest,
  ActivityRelease,
  ActivityReleaseRead,
  ActivityRepository,
  ActivityRun,
} from '@dash/integrations-core';

import { githubReleaseCount } from '#src/contracts/github-activity-queries.ts';
import type {
  GithubDefaultBranchNode,
  GithubFailedSuite,
  GithubIssueNode,
  GithubPullRequestNode,
  GithubReleaseNode,
  GithubReleasesNode,
} from '#src/contracts/github-activity-response.ts';

type FailedSuite = NonNullable<GithubFailedSuite>;

/** A repository and the runs that failed on its default branch head. */
export interface DefaultBranchActivity {
  repository: ActivityRepository;
  runs: ActivityRun[];
}

/** The releases a repository published, and how much of its history the read covered. */
export interface ReleasesActivity {
  releases: ActivityRelease[];
  releaseRead: ActivityReleaseRead;
}

/** GraphQL nodes read as provider-neutral activity records. */
export class GithubActivityRecords {
  static run(props: {
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
  }

  static pullRequest(node: GithubPullRequestNode): ActivityPullRequest {
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
      mergeState: node.mergeStateStatus,
      reviewDecision: node.reviewDecision,
      headRef: node.headRefName,
      headSha: node.headRefOid,
      requestedReviewers: node.reviewRequests.nodes.flatMap(
        ({ requestedReviewer }) =>
          requestedReviewer === null ? [] : [requestedReviewer],
      ),
      checks: commit?.statusCheckRollup ?? null,
      mergedAt: node.mergedAt,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }

  static pullRequestRuns(node: GithubPullRequestNode): ActivityRun[] {
    const suites = node.commits.nodes.at(-1)?.commit.checkSuites.nodes ?? [];
    return suites.flatMap((suite) =>
      suite === null
        ? []
        : [
            GithubActivityRecords.run({
              suite,
              repositoryId: node.repository.externalId,
              pullRequestId: node.id,
              branch: node.headRefName,
              headSha: node.headRefOid,
            }),
          ],
    );
  }

  static issue(node: GithubIssueNode): ActivityIssue {
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
  }

  /** `null` for a draft, which GitHub has not published. */
  static release(props: {
    node: GithubReleaseNode;
    repositoryId: string;
  }): ActivityRelease | null {
    const { node } = props;
    if (node.isDraft || node.publishedAt === null) {
      return null;
    }
    return {
      provider: 'github',
      externalId: node.id,
      url: node.url,
      repositoryId: props.repositoryId,
      tagName: node.tagName,
      name: node.name,
      author: node.author?.login ?? null,
      prerelease: node.isPrerelease,
      publishedAt: node.publishedAt,
    };
  }

  static releases(node: NonNullable<GithubReleasesNode>): ReleasesActivity {
    const releases = node.releases.nodes.flatMap((release) => {
      const read = GithubActivityRecords.release({
        node: release,
        repositoryId: node.id,
      });
      return read === null ? [] : [read];
    });
    return {
      releases,
      releaseRead: {
        repositoryId: node.id,
        exhaustive: node.releases.nodes.length < githubReleaseCount,
        oldestPublishedAt:
          releases
            .map(({ publishedAt }) => publishedAt)
            .toSorted(
              (left, right) => Date.parse(left) - Date.parse(right),
            )[0] ?? null,
      },
    };
  }

  static defaultBranch(
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
              GithubActivityRecords.run({
                suite,
                repositoryId: node.id,
                pullRequestId: null,
                branch: branch.name,
                headSha,
              }),
            ],
      ),
    };
  }
}
