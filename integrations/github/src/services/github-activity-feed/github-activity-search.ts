import { githubActivityQueries } from '#src/contracts/github-activity-queries.ts';
import {
  type GithubGraphqlVariables,
  type GithubIssueNode,
  type GithubPullRequestNode,
  type GithubSearchData,
  githubSearchDataSchema,
} from '#src/contracts/github-activity-response.ts';
import type { GraphqlCall } from '#src/services/github-graphql/github-graphql.ts';

const searchPageSize = 50;
const maxSearchPages = 3;

const searchKeys = ['review', 'authored', 'assigned', 'merged'] as const;

export interface SearchedActivity {
  review: GithubPullRequestNode[];
  authored: GithubPullRequestNode[];
  assigned: GithubIssueNode[];
  merged: GithubPullRequestNode[];
  truncated: boolean;
}

interface Cursor {
  after: string | null;
  done: boolean;
}

interface SearchCursors {
  review: Cursor;
  authored: Cursor;
  assigned: Cursor;
  merged: Cursor;
}

interface SearchQueries {
  review: string;
  authored: string;
  assigned: string;
  merged: string;
}

interface SearchScope {
  viewerLogin: string;
  mergedSince: string;
  account: { login: string; kind: 'organization' | 'user' };
}

/**
 * The viewer's review requests, open pull requests, assigned issues and recently merged
 * pull requests in one account, as four issue searches that share each request. A search
 * drops out of later pages once it has no next page; none reads past `maxSearchPages`.
 */
export class GithubActivitySearch {
  private readonly graphql: GraphqlCall;

  constructor(props: { graphql: GraphqlCall }) {
    this.graphql = props.graphql;
  }

  async run(scope: SearchScope): Promise<SearchedActivity> {
    const queries = GithubActivitySearch.queries(scope);
    const cursors: SearchCursors = {
      review: { after: null, done: false },
      authored: { after: null, done: false },
      assigned: { after: null, done: false },
      merged: { after: null, done: false },
    };
    const found: SearchedActivity = {
      review: [],
      authored: [],
      assigned: [],
      merged: [],
      truncated: false,
    };

    for (let page = 0; page < maxSearchPages; page += 1) {
      const active = searchKeys.filter((key) => !cursors[key].done);
      if (active.length === 0) {
        break;
      }
      const data = githubSearchDataSchema.parse(
        await this.graphql({
          query: githubActivityQueries.search,
          variables: GithubActivitySearch.variables({
            queries,
            cursors,
            active,
          }),
        }),
      );
      GithubActivitySearch.collect({ data, cursors, found });
    }

    found.truncated = searchKeys.some((key) => !cursors[key].done);
    return found;
  }

  private static collect(props: {
    data: GithubSearchData;
    cursors: SearchCursors;
    found: SearchedActivity;
  }): void {
    const { data, cursors, found } = props;
    if (data.review !== undefined) {
      found.review.push(...data.review.nodes);
      cursors.review = GithubActivitySearch.next(data.review.pageInfo);
    }
    if (data.authored !== undefined) {
      found.authored.push(...data.authored.nodes);
      cursors.authored = GithubActivitySearch.next(data.authored.pageInfo);
    }
    if (data.assigned !== undefined) {
      found.assigned.push(...data.assigned.nodes);
      cursors.assigned = GithubActivitySearch.next(data.assigned.pageInfo);
    }
    if (data.merged !== undefined) {
      found.merged.push(...data.merged.nodes);
      cursors.merged = GithubActivitySearch.next(data.merged.pageInfo);
    }
  }

  private static next(pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  }): Cursor {
    return {
      after: pageInfo.endCursor,
      done: !pageInfo.hasNextPage || pageInfo.endCursor === null,
    };
  }

  private static variables(props: {
    queries: SearchQueries;
    cursors: SearchCursors;
    active: readonly string[];
  }) {
    const { queries, cursors, active } = props;
    return {
      pageSize: searchPageSize,
      reviewQuery: queries.review,
      reviewAfter: cursors.review.after,
      withReview: active.includes('review'),
      authoredQuery: queries.authored,
      authoredAfter: cursors.authored.after,
      withAuthored: active.includes('authored'),
      assignedQuery: queries.assigned,
      assignedAfter: cursors.assigned.after,
      withAssigned: active.includes('assigned'),
      mergedQuery: queries.merged,
      mergedAfter: cursors.merged.after,
      withMerged: active.includes('merged'),
    } satisfies GithubGraphqlVariables;
  }

  /** Scoped to the installation's account, so another installation's results never leak in. */
  private static queries(scope: SearchScope): SearchQueries {
    const owner = scope.account.kind === 'organization' ? 'org' : 'user';
    const filter = `${owner}:${scope.account.login}`;
    const open = 'is:open archived:false sort:updated-desc';
    return {
      review: `is:pr ${open} review-requested:${scope.viewerLogin} ${filter}`,
      authored: `is:pr ${open} author:${scope.viewerLogin} ${filter}`,
      assigned: `is:issue ${open} assignee:${scope.viewerLogin} ${filter}`,
      merged: `is:pr is:merged merged:>=${scope.mergedSince} archived:false sort:updated-desc author:${scope.viewerLogin} ${filter}`,
    };
  }
}
