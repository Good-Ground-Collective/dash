const issueFields =
  'id number title url state closedAt updatedAt labels(first: 20) { nodes { name } }';

const ticketFields = `
  ${issueFields}
  comments(last: 1) { nodes { url createdAt author { login } } }
  closedByPullRequestsReferences(first: 5, includeClosedPrs: true) { nodes { url mergedAt author { login } } }`;

const projectsDocument = `
query DashProjects($login: String!, $first: Int!) {
  organization(login: $login) {
    projectsV2(first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage }
      nodes {
        id number title url closed updatedAt
        statusUpdates(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { targetDate } }
      }
    }
  }
}`;

const epicsDocument = `
query DashProjectEpics($projectId: ID!, $first: Int!, $after: String, $filter: String!, $tickets: Int!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      items(first: $first, after: $after, query: $filter) {
        pageInfo { hasNextPage endCursor }
        nodes {
          priority: fieldValueByName(name: "Priority") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          targetDate: fieldValueByName(name: "Target date") {
            ... on ProjectV2ItemFieldDateValue { date }
          }
          content {
            __typename
            ... on Issue {
              ${issueFields}
              subIssues(first: $tickets) { totalCount nodes { ${ticketFields} } }
            }
          }
        }
      }
    }
  }
}`;

/**
 * The GraphQL documents the task tracker sends: an organisation's Projects, then each
 * Project's `epic`-labelled issues with their Priority and Target date fields and their
 * sub-issues in order. Logins and ids travel as variables, never in the text.
 */
export const githubTrackerQueries = {
  projects: projectsDocument,
  epics: epicsDocument,
};
