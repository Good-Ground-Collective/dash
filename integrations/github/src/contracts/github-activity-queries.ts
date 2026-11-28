/** GitHub Actions' App id: check suites from it are workflow runs. */
const actionsAppId = 15_368;

const repositoryFields = 'id nameWithOwner url isArchived';

const failedSuiteFields = `conclusion workflowRun { id runNumber url event updatedAt workflow { name } }`;

const checkContextNodeFields = `
  __typename
  ... on CheckRun {
    name status conclusion detailsUrl completedAt databaseId
    checkSuite { app { slug } workflowRun { databaseId } }
  }
  ... on StatusContext { context state targetUrl description }`;

/** How many checks of one head commit a read asks for; GitHub allows at most 100 per page. */
export const githubCheckContextCount = 100;

const contextCounts =
  'checkRunCountsByState { state count } statusContextCountsByState { state count }';

class PullRequestFields {
  /** Authored pull requests also name their checks; the others only count them, which keeps their cost flat. */
  static selection(props: { withCheckContexts: boolean }): string {
    return `
  ... on PullRequest {
    id number title url state isDraft mergeable mergeStateStatus reviewDecision mergedAt createdAt updatedAt headRefName headRefOid
    author { login }
    repository { ${repositoryFields} defaultBranchRef { name } }
    reviewRequests(first: 10) {
      nodes {
        requestedReviewer {
          __typename
          ... on User { login }
          ... on Bot { login }
          ... on Mannequin { login }
          ... on Team { slug }
        }
      }
    }
    commits(last: 1) {
      nodes {
        commit {
          statusCheckRollup {
            state
            ${
              props.withCheckContexts
                ? `contexts(first: ${githubCheckContextCount}) { ${contextCounts} nodes { ${checkContextNodeFields} } }`
                : `contexts(first: 1) { ${contextCounts} }`
            }
          }
          checkSuites(first: 20, filterBy: { appId: ${actionsAppId} }) { nodes { ${failedSuiteFields} } }
        }
      }
    }
  }`;
  }
}

const countedPullRequestFields = PullRequestFields.selection({
  withCheckContexts: false,
});
const namedPullRequestFields = PullRequestFields.selection({
  withCheckContexts: true,
});

const issueFields = `
  ... on Issue {
    id number title url updatedAt
    author { login }
    repository { ${repositoryFields} defaultBranchRef { name } }
    assignees(first: 10) { nodes { login } }
  }`;

const releaseFields = `id name tagName url isDraft isPrerelease publishedAt author { login }`;

/**
 * How many of a repository's newest releases one read asks for. GitHub orders them only by
 * creation time or name, so a release published recently from one created before the newest
 * `githubReleaseCount` (drafts included) is missed until the repository has fewer of them.
 */
export const githubReleaseCount = 10;

const pageInfo = 'pageInfo { hasNextPage endCursor }';

const searchDocument = `
query DashActivity(
  $pageSize: Int!
  $reviewQuery: String!, $reviewAfter: String, $withReview: Boolean!
  $authoredQuery: String!, $authoredAfter: String, $withAuthored: Boolean!
  $assignedQuery: String!, $assignedAfter: String, $withAssigned: Boolean!
  $mergedQuery: String!, $mergedAfter: String, $withMerged: Boolean!
) {
  review: search(type: ISSUE, query: $reviewQuery, first: $pageSize, after: $reviewAfter) @include(if: $withReview) {
    ${pageInfo} nodes { ${countedPullRequestFields} }
  }
  authored: search(type: ISSUE, query: $authoredQuery, first: $pageSize, after: $authoredAfter) @include(if: $withAuthored) {
    ${pageInfo} nodes { ${namedPullRequestFields} }
  }
  assigned: search(type: ISSUE, query: $assignedQuery, first: $pageSize, after: $assignedAfter) @include(if: $withAssigned) {
    ${pageInfo} nodes { ${issueFields} }
  }
  merged: search(type: ISSUE, query: $mergedQuery, first: $pageSize, after: $mergedAfter) @include(if: $withMerged) {
    ${pageInfo} nodes { ${countedPullRequestFields} }
  }
}`;

class RepositoryBatch {
  static variables(count: number): string {
    return Array.from(
      { length: count },
      (_, index) => `$owner${index}: String!, $name${index}: String!`,
    ).join(', ');
  }

  static aliases(props: { count: number; fields: string }): string {
    return Array.from(
      { length: props.count },
      (_, index) => `
  repository${index}: repository(owner: $owner${index}, name: $name${index}) {${props.fields}
  }`,
    ).join('');
  }
}

/**
 * The GraphQL documents the activity feed sends. Repositories are batched as aliases
 * `repository0`, `repository1`… whose owner and name travel as variables, never in the text.
 */
export const githubActivityQueries = {
  search: searchDocument,

  defaultBranches(count: number): string {
    return `query DashDefaultBranches(${RepositoryBatch.variables(count)}) {${RepositoryBatch.aliases(
      {
        count,
        fields: `
    ${repositoryFields}
    defaultBranchRef {
      name
      target {
        ... on Commit {
          oid
          statusCheckRollup {
            state
            contexts(first: ${githubCheckContextCount}) { totalCount nodes { ${checkContextNodeFields} } }
          }
          checkSuites(first: 20, filterBy: { appId: ${actionsAppId} }) { nodes { ${failedSuiteFields} } }
        }
      }
    }`,
      },
    )}\n}`;
  },

  /**
   * Read apart from the default branches: an installation without Contents access may be
   * refused a repository's releases, and that must cost only the releases, not the runs.
   */
  releases(count: number): string {
    return `query DashReleases(${RepositoryBatch.variables(count)}) {${RepositoryBatch.aliases(
      {
        count,
        fields: `
    id
    releases(first: ${githubReleaseCount}, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { ${releaseFields} } }`,
      },
    )}\n}`;
  },
};
