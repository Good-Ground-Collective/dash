import {
  type Activity,
  type ActivityCheck,
  type ActivityDefaultBranch,
  type ActivityFeed,
  type ActivityQuery,
  activityQuerySchema,
  type ActivityRepository,
  type ActivityRun,
} from '@dash/integrations-core';
import { z } from 'zod';

import { githubActivityQueries } from '#src/contracts/github-activity-queries.ts';
import { GithubActivityRecords } from '#src/contracts/github-activity-records.ts';
import { githubDefaultBranchNodeSchema } from '#src/contracts/github-activity-response.ts';
import { githubAppConfigSchema } from '#src/contracts/github-app-config.ts';
import { GithubRepositoryBatches } from '#src/contracts/github-repository-batches.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import {
  GithubActivityReleases,
  type ReadReleases,
} from '#src/services/github-activity-feed/github-activity-releases.ts';
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
const toleratedRepositoryErrors = new Set(['NOT_FOUND', 'FORBIDDEN']);

interface DefaultBranches {
  repositories: ActivityRepository[];
  runs: ActivityRun[];
  branches: ActivityDefaultBranch[];
  checks: ActivityCheck[];
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
 * A person's work in one installation, read with an installation token: four issue
 * searches share each GraphQL request, and default branches and recent releases are
 * read in separate batches of repository aliases. Pages and repositories are capped, so
 * a busy account costs at most three search requests, three branch requests and three
 * release requests.
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
      mergedSince: GithubActivityFeed.searchDate(parsed.since),
    });
    const candidates = GithubActivityFeed.branchCandidates({
      searched,
      repositories: parsed.repositories,
    });
    const fullNames = candidates.slice(0, maxDefaultBranchRepositories);
    const branches = await this.defaultBranches({ graphql, fullNames });
    const releases = await new GithubActivityReleases({ graphql }).read({
      fullNames,
      since: parsed.since,
    });

    return GithubActivityFeed.assemble({
      searched,
      branches,
      releases,
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
    const branches: ActivityDefaultBranch[] = [];
    const checks: ActivityCheck[] = [];
    for (const batch of GithubRepositoryBatches.split(props.fullNames)) {
      const data = await props.graphql({
        query: githubActivityQueries.defaultBranches(batch.length),
        variables: GithubRepositoryBatches.variables(batch),
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
          checks.push(...read.checks);
          if (read.branch !== null) {
            branches.push(read.branch);
          }
        }
      }
    }
    return { repositories, runs, branches, checks };
  }

  /** GitHub's search takes whole seconds in UTC. */
  private static searchDate(since: string): string {
    return new Date(since).toISOString().replace(/\.\d{3}Z$/u, 'Z');
  }

  /** The repositories the viewer's own work is in first, then the rest the caller named. */
  private static branchCandidates(props: {
    searched: SearchedActivity;
    repositories: readonly string[];
  }): string[] {
    const { review, authored, assigned, merged } = props.searched;
    const touched = [...review, ...authored, ...assigned, ...merged]
      .filter(({ repository }) => !repository.archived)
      .map(({ repository }) => repository.fullName);
    return [...new Set([...touched, ...props.repositories])];
  }

  private static assemble(props: {
    searched: SearchedActivity;
    branches: DefaultBranches;
    releases: ReadReleases;
    truncated: boolean;
  }): Activity {
    const { review, authored, assigned, merged } = props.searched;
    const repositories = new Map<string, ActivityRepository>();
    for (const repository of [
      ...[...review, ...authored, ...assigned, ...merged].map(
        (node) => node.repository,
      ),
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
      mergedPullRequests: merged.map((node) =>
        GithubActivityRecords.pullRequest(node),
      ),
      releases: props.releases.releases,
      releaseReads: props.releases.releaseReads,
      failedRuns: [...runs.values()],
      defaultBranches: props.branches.branches,
      checks: [
        ...authored.flatMap((node) =>
          GithubActivityRecords.pullRequestFailingChecks(node),
        ),
        ...props.branches.checks,
      ],
      assignedIssues: assigned.map((node) => GithubActivityRecords.issue(node)),
      truncated: props.truncated,
    };
  }
}
