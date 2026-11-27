import type {
  GithubBody,
  GithubJson,
} from '#src/__tests__/support/fake-github.ts';

const updatedAt = '2026-11-26T11:00:00Z';

/** GraphQL nodes as GitHub returns them for the activity feed's queries. */
export class ActivityNodes {
  static repositoryNode(props: {
    fullName: string;
    archived?: boolean;
  }): GithubBody {
    return {
      id: `R_${props.fullName}`,
      nameWithOwner: props.fullName,
      url: `https://github.com/${props.fullName}`,
      isArchived: props.archived ?? false,
      defaultBranchRef: { name: 'main' },
    };
  }

  static failedSuite(props: {
    id: string;
    name: string;
    conclusion?: string;
  }): GithubBody {
    return {
      conclusion: props.conclusion ?? 'FAILURE',
      workflowRun: {
        id: props.id,
        runNumber: 7,
        url: `https://github.com/acme/app/actions/runs/${props.id}`,
        event: 'push',
        updatedAt,
        workflow: { name: props.name },
      },
    };
  }

  static pullRequestNode(props: {
    number: number;
    author?: string;
    fullName?: string;
    suites?: GithubJson[];
  }): GithubBody {
    const fullName = props.fullName ?? 'acme/app';
    return {
      id: `PR_${fullName}_${props.number}`,
      number: props.number,
      title: `Change ${props.number}`,
      url: `https://github.com/${fullName}/pull/${props.number}`,
      state: 'OPEN',
      isDraft: false,
      mergeable: 'MERGEABLE',
      reviewDecision: 'REVIEW_REQUIRED',
      updatedAt,
      headRefName: `feature-${props.number}`,
      headRefOid: `sha${props.number}`,
      author: { login: props.author ?? 'grace' },
      repository: ActivityNodes.repositoryNode({ fullName }),
      reviewRequests: {
        nodes: [
          { requestedReviewer: { __typename: 'User', login: 'octocat' } },
          { requestedReviewer: { __typename: 'Team', slug: 'platform' } },
          { requestedReviewer: null },
        ],
      },
      commits: {
        nodes: [
          {
            commit: {
              statusCheckRollup: {
                state: 'FAILURE',
                contexts: {
                  checkRunCountsByState: [
                    { state: 'SUCCESS', count: 3 },
                    { state: 'SKIPPED', count: 1 },
                    { state: 'FAILURE', count: 1 },
                    { state: 'IN_PROGRESS', count: 2 },
                  ],
                  statusContextCountsByState: [{ state: 'ERROR', count: 1 }],
                },
              },
              checkSuites: { nodes: props.suites ?? [] },
            },
          },
        ],
      },
    };
  }

  static issueNode(props: { number: number }): GithubBody {
    return {
      id: `I_${props.number}`,
      number: props.number,
      title: `Bug ${props.number}`,
      url: `https://github.com/acme/app/issues/${props.number}`,
      updatedAt,
      author: null,
      repository: ActivityNodes.repositoryNode({ fullName: 'acme/app' }),
      assignees: { nodes: [{ login: 'octocat' }, { login: 'grace' }] },
    };
  }

  static page(props: { nodes: GithubJson[]; next?: string }): GithubBody {
    return {
      pageInfo: {
        hasNextPage: props.next !== undefined,
        endCursor: props.next ?? null,
      },
      nodes: props.nodes,
    };
  }

  static defaultBranchNode(props: {
    fullName: string;
    suites?: GithubJson[];
  }): GithubBody {
    return {
      ...ActivityNodes.repositoryNode(props),
      defaultBranchRef: {
        name: 'main',
        target: {
          oid: `head-${props.fullName}`,
          checkSuites: { nodes: props.suites ?? [] },
        },
      },
    };
  }
}
