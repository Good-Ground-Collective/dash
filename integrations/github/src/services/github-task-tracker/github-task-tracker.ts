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

/** Whether an epic's priority came from a Project's Priority field or its `P1`–`P3` label. */
type PrioritySource = 'field' | 'label';

interface ReadEpics {
  epics: Map<string, Epic>;
  prioritySources: Map<string, PrioritySource>;
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
      prioritySources: new Map(),
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

  /** One Project's epics, merged into `read`: an epic already read in another Project gains this one as an initiative. */
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
              prioritySource: item.priority === null ? 'label' : 'field',
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

  /** Keeps the first due date and Priority field read, and lets a Priority field replace a label fallback from an earlier Project. */
  private static merge(props: {
    read: ReadEpics;
    epic: Epic;
    prioritySource: PrioritySource;
  }): Epic {
    const { read, epic, prioritySource } = props;
    const known = read.epics.get(epic.externalId);
    const keepsPriority =
      known !== undefined &&
      (read.prioritySources.get(epic.externalId) === 'field' ||
        prioritySource === 'label');
    const merged: Epic =
      known === undefined
        ? epic
        : {
            ...known,
            priority: keepsPriority
              ? (known.priority ?? epic.priority)
              : epic.priority,
            dueDate: known.dueDate ?? epic.dueDate,
            initiativeIds: [
              ...new Set([...known.initiativeIds, ...epic.initiativeIds]),
            ],
          };
    if (!keepsPriority) {
      read.prioritySources.set(epic.externalId, prioritySource);
    }
    read.epics.set(merged.externalId, merged);
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
