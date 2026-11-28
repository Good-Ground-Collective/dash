/** GitHub Actions' App id: check suites from it are workflow runs. */
const actionsAppId = 15_368;

const repositoryFields = 'id nameWithOwner url isArchived';

const failedSuiteFields = `conclusion workflowRun { id runNumber url event updatedAt workflow { name } }`;

const pullRequestFields = `
  ... on PullRequest {
    id number title url state isDraft mergeable reviewDecision mergedAt updatedAt headRefName headRefOid
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
            contexts(first: 1) {
              checkRunCountsByState { state count }
              statusContextCountsByState { state count }
            }
          }
          checkSuites(first: 20, filterBy: { appId: ${actionsAppId} }) { nodes { ${failedSuiteFields} } }
        }
      }
    }
  }`;

const issueFields = `
  ... on Issue {
    id number title url updatedAt
    author { login }
    repository { ${repositoryFields} defaultBranchRef { name } }
    assignees(first: 10) { nodes { login } }
  }`;

const releaseFields = `id name tagName url isDraft isPrerelease publishedAt author { login }`;

const releaseCount = 5;

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
    ${pageInfo} nodes { ${pullRequestFields} }
  }
  authored: search(type: ISSUE, query: $authoredQuery, first: $pageSize, after: $authoredAfter) @include(if: $withAuthored) {
    ${pageInfo} nodes { ${pullRequestFields} }
  }
  assigned: search(type: ISSUE, query: $assignedQuery, first: $pageSize, after: $assignedAfter) @include(if: $withAssigned) {
    ${pageInfo} nodes { ${issueFields} }
  }
  merged: search(type: ISSUE, query: $mergedQuery, first: $pageSize, after: $mergedAfter) @include(if: $withMerged) {
    ${pageInfo} nodes { ${pullRequestFields} }
  }
}`;

/**
 * The GraphQL documents the activity feed sends. Repositories are batched as aliases
 * `repository0`, `repository1`… whose owner and name travel as variables, never in the text.
 */
export const githubActivityQueries = {
  search: searchDocument,

  defaultBranches(count: number): string {
    const indexes = Array.from({ length: count }, (_, index) => index);
    const variables = indexes
      .map((index) => `$owner${index}: String!, $name${index}: String!`)
      .join(', ');
    const fields = indexes
      .map(
        (index) => `
  repository${index}: repository(owner: $owner${index}, name: $name${index}) {
    ${repositoryFields}
    releases(first: ${releaseCount}, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { ${releaseFields} } }
    defaultBranchRef {
      name
      target {
        ... on Commit {
          oid
          checkSuites(first: 20, filterBy: { appId: ${actionsAppId} }) { nodes { ${failedSuiteFields} } }
        }
      }
    }
  }`,
      )
      .join('');
    return `query DashDefaultBranches(${variables}) {${fields}\n}`;
  },
};
