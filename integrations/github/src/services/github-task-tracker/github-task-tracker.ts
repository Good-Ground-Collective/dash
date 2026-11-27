import {
  type Epic,
  type TaskTracker,
  type Ticket,
  type TicketActivity,
  TrackerAccountUnsupportedError,
  type TrackerQuery,
  trackerQuerySchema,
  type TrackerSnapshot,
} from '@dash/integrations-core';
import { z } from 'zod';

import { githubAppConfigSchema } from '#src/contracts/github-app-config.ts';
import type { GithubRequest } from '#src/contracts/github-request.ts';
import { githubTrackerQueries } from '#src/contracts/github-tracker-queries.ts';
import { GithubTrackerRecords } from '#src/contracts/github-tracker-records.ts';
import {
  type GithubEpicIssue,
  githubEpicsDataSchema,
  type GithubProject,
  githubProjectsDataSchema,
} from '#src/contracts/github-tracker-response.ts';
import {
  AppGithubGraphql,
  type GithubGraphql,
  type GraphqlCall,
} from '#src/services/github-graphql/github-graphql.ts';

const maxProjects = 10;
const epicPageSize = 50;
const maxEpicPages = 2;
const maxTicketsPerEpic = 50;
const epicFilter = 'label:epic';

const githubTaskTrackerPropsSchema = githubAppConfigSchema
  .pick({ appId: true, privateKey: true })
  .extend({
    request: z.custom<GithubRequest>((value) => value instanceof Function),
  });

const githubTrackerQuerySchema = trackerQuerySchema.extend({
  account: z.object({
    login: z
      .string()
      .regex(/^[A-Za-z\d](?:[A-Za-z\d-]{0,38})$/u, 'Expected a GitHub login'),
    kind: z.enum(['organization', 'user']),
  }),
});

interface ReadEpics {
  epics: Map<string, Epic>;
  tickets: Map<string, Ticket>;
  activity: TicketActivity[];
  truncated: boolean;
}

/**
 * Reads an organisation's Projects as initiatives, the `epic`-labelled issues in each as
 * epics and their sub-issues, in order, as tickets, with an installation token. At most
 * `maxProjects` Projects (most recently updated first), `epicPageSize × maxEpicPages` epics
 * a Project and `maxTicketsPerEpic` tickets an epic, so a read costs at most 21 requests.
 * GitHub gives apps no access to Projects a personal account owns.
 */
export class GithubTaskTracker implements TaskTracker {
  private readonly graphql: GithubGraphql;

  constructor(props: z.input<typeof githubTaskTrackerPropsSchema>) {
    this.graphql = new AppGithubGraphql(
      githubTaskTrackerPropsSchema.parse(props),
    );
  }

  async read(query: TrackerQuery): Promise<TrackerSnapshot> {
    const parsed = githubTrackerQuerySchema.parse(query);
    if (parsed.account.kind !== 'organization') {
      throw new TrackerAccountUnsupportedError({
        provider: 'github',
        accountKind: parsed.account.kind,
      });
    }
    const graphql = await this.graphql.forInstallation(parsed.installationId);

    const data = githubProjectsDataSchema.parse(
      await graphql({
        query: githubTrackerQueries.projects,
        variables: { login: parsed.account.login, first: maxProjects },
      }),
    );
    const projects = data.organization?.projectsV2.nodes ?? [];
    const read: ReadEpics = {
      epics: new Map(),
      tickets: new Map(),
      activity: [],
      truncated: data.organization?.projectsV2.pageInfo.hasNextPage ?? false,
    };
    const projectEpics = new Map<string, Epic[]>();
    for (const project of projects) {
      projectEpics.set(
        project.id,
        await GithubTaskTracker.readEpics({ graphql, project, read }),
      );
    }

    return {
      initiatives: projects.map((project) =>
        GithubTrackerRecords.initiative({
          project,
          epics: projectEpics.get(project.id) ?? [],
        }),
      ),
      epics: [...read.epics.values()],
      tickets: [...read.tickets.values()],
      activity: read.activity,
      truncated: read.truncated,
    };
  }

  /** One Project's epics, merged into `read`: an epic already read in another Project gains this one as an initiative and keeps its fields. */
  private static async readEpics(props: {
    graphql: GraphqlCall;
    project: GithubProject;
    read: ReadEpics;
  }): Promise<Epic[]> {
    const { graphql, project, read } = props;
    const found: Epic[] = [];
    let after: string | null = null;

    for (let page = 0; page < maxEpicPages; page += 1) {
      const data = githubEpicsDataSchema.parse(
        await graphql({
          query: githubTrackerQueries.epics,
          variables: {
            projectId: project.id,
            first: epicPageSize,
            after,
            filter: epicFilter,
            tickets: maxTicketsPerEpic,
          },
        }),
      );
      const items = data.node?.items;
      for (const item of items?.nodes ?? []) {
        const issue = item.content;
        if (issue?.__typename === 'Issue' && issue.labels.epic) {
          if (!read.epics.has(issue.id)) {
            GithubTaskTracker.collectTickets({ read, issue });
          }
          found.push(
            GithubTaskTracker.merge({
              read,
              epic: GithubTrackerRecords.epic({
                item,
                issue,
                initiativeId: project.id,
              }),
            }),
          );
        }
      }

      after = items?.pageInfo.endCursor ?? null;
      if (items?.pageInfo.hasNextPage !== true || after === null) {
        return found;
      }
    }
    read.truncated = true;
    return found;
  }

  private static merge(props: { read: ReadEpics; epic: Epic }): Epic {
    const known = props.read.epics.get(props.epic.externalId);
    const merged: Epic =
      known === undefined
        ? props.epic
        : {
            ...known,
            priority: known.priority ?? props.epic.priority,
            dueDate: known.dueDate ?? props.epic.dueDate,
            initiativeIds: [
              ...new Set([...known.initiativeIds, ...props.epic.initiativeIds]),
            ],
          };
    props.read.epics.set(merged.externalId, merged);
    return merged;
  }

  private static collectTickets(props: {
    read: ReadEpics;
    issue: GithubEpicIssue;
  }): void {
    const { read, issue } = props;
    for (const [position, node] of issue.subIssues.nodes.entries()) {
      read.tickets.set(
        node.id,
        GithubTrackerRecords.ticket({ node, epicId: issue.id, position }),
      );
      read.activity.push(...GithubTrackerRecords.activity(node));
    }
    if (issue.subIssues.totalCount > issue.subIssues.nodes.length) {
      read.truncated = true;
    }
  }
}
