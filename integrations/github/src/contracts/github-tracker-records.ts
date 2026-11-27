import type {
  Epic,
  Initiative,
  Ticket,
  TicketActivity,
} from '@dash/integrations-core';

import type {
  GithubEpicIssue,
  GithubEpicItem,
  GithubProject,
  GithubTicketNode,
} from '#src/contracts/github-tracker-response.ts';

/** GraphQL nodes read as provider-neutral initiatives, epics, tickets and ticket activity. */
export class GithubTrackerRecords {
  static initiative(props: {
    project: GithubProject;
    epics: readonly Epic[];
  }): Initiative {
    const { project } = props;
    return {
      provider: 'github',
      externalId: project.id,
      url: project.url,
      level: 'initiative',
      title: project.title,
      state: project.closed ? 'closed' : 'open',
      priority: null,
      dueDate: project.targetDate,
      lastActivityAt: GithubTrackerRecords.latest([
        project.updatedAt,
        ...props.epics.map(({ lastActivityAt }) => lastActivityAt),
      ]),
    };
  }

  /** Priority and Target date come from the Project item; a `P1`–`P3` label stands in for a missing Priority. */
  static epic(props: {
    item: GithubEpicItem;
    issue: GithubEpicIssue;
    initiativeId: string;
  }): Epic {
    const { item, issue } = props;
    return {
      provider: 'github',
      externalId: issue.id,
      url: issue.url,
      level: 'epic',
      title: issue.title,
      state: issue.state,
      priority: item.priority ?? issue.labels.priority,
      dueDate: item.targetDate,
      lastActivityAt: GithubTrackerRecords.latest([
        issue.updatedAt,
        ...issue.subIssues.nodes.map(({ updatedAt }) => updatedAt),
      ]),
      initiativeIds: [props.initiativeId],
    };
  }

  static ticket(props: {
    node: GithubTicketNode;
    epicId: string;
    position: number;
  }): Ticket {
    const { node } = props;
    return {
      provider: 'github',
      externalId: node.id,
      url: node.url,
      level: 'ticket',
      title: node.title,
      state: node.state,
      priority: node.labels.priority,
      dueDate: null,
      lastActivityAt: node.updatedAt,
      epicId: props.epicId,
      position: props.position,
    };
  }

  /** The newest closing, merged pull request and comment on a ticket. */
  static activity(node: GithubTicketNode): TicketActivity[] {
    const activity: TicketActivity[] = [];
    if (node.state === 'closed' && node.closedAt !== null) {
      activity.push({
        ticketId: node.id,
        kind: 'ticket_closed',
        occurredAt: node.closedAt,
        actor: null,
        url: node.url,
      });
    }

    const merged = (node.closedByPullRequestsReferences?.nodes ?? [])
      .flatMap(({ mergedAt, ...pull }) =>
        mergedAt === null ? [] : [{ ...pull, mergedAt }],
      )
      .toSorted(
        (left, right) => Date.parse(right.mergedAt) - Date.parse(left.mergedAt),
      )
      .at(0);
    if (merged !== undefined) {
      activity.push({
        ticketId: node.id,
        kind: 'pull_request_merged',
        occurredAt: merged.mergedAt,
        actor: merged.author,
        url: merged.url,
      });
    }

    const comment = node.comments.nodes.at(-1);
    if (comment !== undefined) {
      activity.push({
        ticketId: node.id,
        kind: 'commented',
        occurredAt: comment.createdAt,
        actor: comment.author,
        url: comment.url,
      });
    }
    return activity;
  }

  private static latest(timestamps: readonly string[]): string {
    return timestamps.reduce((latest, timestamp) =>
      Date.parse(timestamp) > Date.parse(latest) ? timestamp : latest,
    );
  }
}
