import type {
  GithubBody,
  GithubJson,
} from '#src/__tests__/support/fake-github.ts';

const updatedAt = '2026-11-20T09:00:00Z';

/** GraphQL nodes as GitHub returns them for the task tracker's queries. */
export class TrackerNodes {
  static project(props: {
    number: number;
    closed?: boolean;
    targetDate?: string | null;
  }): GithubBody {
    return {
      id: `PVT_${props.number}`,
      number: props.number,
      title: `Initiative ${props.number}`,
      url: `https://github.com/orgs/acme/projects/${props.number}`,
      closed: props.closed ?? false,
      updatedAt,
      statusUpdates: {
        nodes:
          props.targetDate === undefined || props.targetDate === null
            ? []
            : [{ targetDate: props.targetDate }],
      },
    };
  }

  static projects(props: {
    nodes: GithubJson[];
    hasNextPage?: boolean;
  }): GithubBody {
    return {
      data: {
        organization: {
          projectsV2: {
            pageInfo: { hasNextPage: props.hasNextPage ?? false },
            nodes: props.nodes,
          },
        },
      },
    };
  }

  static ticket(props: {
    number: number;
    state?: 'OPEN' | 'CLOSED';
    labels?: string[];
    updatedAt?: string;
    comment?: string;
    mergedAt?: string;
  }): GithubBody {
    const closed = props.state === 'CLOSED';
    return {
      ...TrackerNodes.issue({ ...props, labels: props.labels ?? [] }),
      closedAt: closed ? '2026-11-21T10:00:00Z' : null,
      comments: {
        nodes:
          props.comment === undefined
            ? []
            : [
                {
                  url: `https://github.com/acme/app/issues/${props.number}#comment`,
                  createdAt: props.comment,
                  author: { login: 'grace' },
                },
              ],
      },
      closedByPullRequestsReferences: {
        nodes:
          props.mergedAt === undefined
            ? []
            : [
                {
                  url: 'https://github.com/acme/app/pull/90',
                  mergedAt: null,
                  author: { login: 'ada' },
                },
                {
                  url: 'https://github.com/acme/app/pull/91',
                  mergedAt: props.mergedAt,
                  author: { login: 'ada' },
                },
              ],
      },
    };
  }

  /** A Project item for an epic issue, with its Priority and Target date when set. */
  static epicItem(props: {
    number: number;
    priority?: string | null;
    targetDate?: string | null;
    labels?: string[];
    state?: 'OPEN' | 'CLOSED';
    tickets?: GithubJson[];
    ticketCount?: number;
  }): GithubBody {
    const tickets = props.tickets ?? [];
    return {
      priority:
        props.priority === undefined || props.priority === null
          ? null
          : { name: props.priority },
      targetDate:
        props.targetDate === undefined || props.targetDate === null
          ? null
          : { date: props.targetDate },
      content: {
        __typename: 'Issue',
        ...TrackerNodes.issue({
          number: props.number,
          labels: props.labels ?? ['epic'],
          state: props.state,
        }),
        closedAt: props.state === 'CLOSED' ? '2026-11-22T10:00:00Z' : null,
        subIssues: {
          totalCount: props.ticketCount ?? tickets.length,
          nodes: tickets,
        },
      },
    };
  }

  static epics(props: {
    nodes: GithubJson[];
    endCursor?: string | null;
  }): GithubBody {
    const endCursor = props.endCursor ?? null;
    return {
      data: {
        node: {
          items: {
            pageInfo: { hasNextPage: endCursor !== null, endCursor },
            nodes: props.nodes,
          },
        },
      },
    };
  }

  private static issue(props: {
    number: number;
    labels: string[];
    state?: 'OPEN' | 'CLOSED' | undefined;
    updatedAt?: string | undefined;
  }): GithubBody {
    return {
      id: `I_${props.number}`,
      number: props.number,
      title: `Issue ${props.number}`,
      url: `https://github.com/acme/app/issues/${props.number}`,
      state: props.state ?? 'OPEN',
      updatedAt: props.updatedAt ?? updatedAt,
      labels: { nodes: props.labels.map((name) => ({ name })) },
    };
  }
}
