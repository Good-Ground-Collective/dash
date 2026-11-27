import {
  type Activity,
  type ActivityFeed,
  type ActivityQuery,
  activityQuerySchema,
  type ActivityRepository,
  type ActivityRun,
} from '@dash/integrations-core';
import { z } from 'zod';

import { githubActivityQueries } from '#src/contracts/github-activity-queries.ts';
import { GithubActivityRecords } from '#src/contracts/github-activity-records.ts';
import {
  githubDefaultBranchNodeSchema,
  type GithubGraphqlVariables,
} from '#src/contracts/github-activity-response.ts';
import { githubAppConfigSchema } from '#src/contracts/github-app-config.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import {
  GithubActivitySearch,
  type SearchedActivity,
} from '#src/services/github-activity-feed/github-activity-search.ts';
import {
  AppGithubGraphql,
  type GithubGraphql,
  type GraphqlCall,
} from '#src/services/github-graphql/github-graphql.ts';

const maxDefaultBranchRepositories = 30;
const defaultBranchBatchSize = 10;
const toleratedRepositoryErrors = new Set(['NOT_FOUND', 'FORBIDDEN']);

interface DefaultBranches {
  repositories: ActivityRepository[];
  runs: ActivityRun[];
}

const loginSchema = z
  .string()
  .regex(/^[A-Za-z\d](?:[A-Za-z\d-]{0,38})$/u, 'Expected a GitHub login');

const githubActivityFeedPropsSchema = githubAppConfigSchema
  .pick({ appId: true, privateKey: true })
  .extend({
    request: z.custom<GithubRequest>((value) => value instanceof Function),
  });

const githubActivityQuerySchema = activityQuerySchema.extend({
  account: z.object({
    login: loginSchema,
    kind: z.enum(['organization', 'user']),
  }),
  viewerLogin: loginSchema,
});

/**
 * A person's open work in one installation, read with an installation token: three issue
 * searches share each GraphQL request, and default branches are read in batches of
 * repository aliases. Pages and repositories are capped, so a busy account costs at most
 * three search requests and three branch requests.
 */
export class GithubActivityFeed implements ActivityFeed {
  private readonly graphql: GithubGraphql;

  constructor(props: z.input<typeof githubActivityFeedPropsSchema>) {
    this.graphql = new AppGithubGraphql(
      githubActivityFeedPropsSchema.parse(props),
    );
  }

  async read(query: ActivityQuery): Promise<Activity> {
    const parsed = githubActivityQuerySchema.parse(query);
    const graphql = await this.graphql.forInstallation(parsed.installationId);

    const searched = await new GithubActivitySearch({ graphql }).run({
      viewerLogin: parsed.viewerLogin,
      account: parsed.account,
    });
    const candidates = GithubActivityFeed.branchCandidates({
      searched,
      repositories: parsed.repositories,
    });
    const branches = await this.defaultBranches({
      graphql,
      fullNames: candidates.slice(0, maxDefaultBranchRepositories),
    });

    return GithubActivityFeed.assemble({
      searched,
      branches,
      truncated:
        searched.truncated || candidates.length > maxDefaultBranchRepositories,
    });
  }

  private async defaultBranches(props: {
    graphql: GraphqlCall;
    fullNames: readonly string[];
  }): Promise<DefaultBranches> {
    const repositories: ActivityRepository[] = [];
    const runs: ActivityRun[] = [];
    for (
      let start = 0;
      start < props.fullNames.length;
      start += defaultBranchBatchSize
    ) {
      const batch = props.fullNames.slice(
        start,
        start + defaultBranchBatchSize,
      );
      const data = await props.graphql({
        query: githubActivityQueries.defaultBranches(batch.length),
        variables: GithubActivityFeed.repositoryVariables(batch),
        tolerate: toleratedRepositoryErrors,
      });
      for (const index of batch.keys()) {
        const node = githubDefaultBranchNodeSchema.parse(
          data[`repository${index}`] ?? null,
        );
        if (node !== null) {
          const read = GithubActivityRecords.defaultBranch(node);
          repositories.push(read.repository);
          runs.push(...read.runs);
        }
      }
    }
    return { repositories, runs };
  }

  private static repositoryVariables(fullNames: readonly string[]) {
    return Object.fromEntries(
      fullNames.flatMap((fullName, index) => {
        const [owner = '', name = ''] = fullName.split('/');
        return [
          [`owner${index}`, owner],
          [`name${index}`, name],
        ];
      }),
    ) satisfies GithubGraphqlVariables;
  }

  /** The repositories the viewer's own work is in first, then the rest the caller named. */
  private static branchCandidates(props: {
    searched: SearchedActivity;
    repositories: readonly string[];
  }): string[] {
    const { review, authored, assigned } = props.searched;
    const touched = [...review, ...authored, ...assigned]
      .filter(({ repository }) => !repository.archived)
      .map(({ repository }) => repository.fullName);
    return [...new Set([...touched, ...props.repositories])];
  }

  private static assemble(props: {
    searched: SearchedActivity;
    branches: DefaultBranches;
    truncated: boolean;
  }): Activity {
    const { review, authored, assigned } = props.searched;
    const repositories = new Map<string, ActivityRepository>();
    for (const repository of [
      ...[...review, ...authored, ...assigned].map((node) => node.repository),
      ...props.branches.repositories,
    ]) {
      repositories.set(repository.externalId, repository);
    }
    const runs = new Map<string, ActivityRun>();
    for (const run of [
      ...authored.flatMap((node) =>
        GithubActivityRecords.pullRequestRuns(node),
      ),
      ...props.branches.runs,
    ]) {
      runs.set(run.externalId, run);
    }

    return {
      repositories: [...repositories.values()],
      reviewRequests: review.map((node) =>
        GithubActivityRecords.pullRequest(node),
      ),
      authoredPullRequests: authored.map((node) =>
        GithubActivityRecords.pullRequest(node),
      ),
      failedRuns: [...runs.values()],
      assignedIssues: assigned.map((node) => GithubActivityRecords.issue(node)),
      truncated: props.truncated,
    };
  }
}
