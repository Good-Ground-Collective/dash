import type {
  BriefingChangeDraft,
  BriefingSinceLastBriefingDraft,
} from '#src/briefing/contracts/briefing-snapshot.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingText } from '#src/briefing/services/briefing-text/briefing-text.ts';
import type {
  EpicObjective,
  InitiativeObjective,
  Objectives,
} from '#src/objectives/contracts/objectives.ts';
import type { ConnectionObjectives } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';

interface EpicPace {
  ticketsClosed: number;
  pullRequestsMerged: number;
}

const noPace: EpicPace = { ticketsClosed: 0, pullRequestsMerged: 0 };

const substanceRank = {
  initiativeClosed: 0,
  epicClosed: 1,
  started: 2,
  progressed: 3,
} as const;

/**
 * What moved since a point in time, for the briefing's opening to weigh: initiatives and epics
 * that closed, epics that started and epics that made progress, with the tickets closed and
 * pull requests merged under each. The tracker keeps no history of status, so an objective
 * counts as closed when it is closed and its last activity falls after `since`, and an epic as
 * started when every ticket it has closed so far closed after `since`. Items come most
 * substantial first: initiative closed, epic closed, started, then progress by how much merged.
 */
export class BriefingChangeSections {
  static since(props: {
    connections: readonly ConnectionObjectives[];
    objectives: Objectives;
    since: Date;
    previousBriefingAt: Date | null;
  }): BriefingSinceLastBriefingDraft {
    const pace = BriefingChangeSections.paceByEpic(props);
    const ranked = BriefingChangeSections.ranked({ ...props, pace });

    const totals = {
      initiativesClosed: ranked.filter(
        ({ rank }) => rank === substanceRank.initiativeClosed,
      ).length,
      epicsClosed: ranked.filter(
        ({ rank }) => rank === substanceRank.epicClosed,
      ).length,
      epicsStarted: ranked.filter(({ rank }) => rank === substanceRank.started)
        .length,
      epicsProgressed: ranked.filter(
        ({ rank }) => rank === substanceRank.progressed,
      ).length,
      ticketsClosed: [...pace.values()].reduce(
        (sum, epic) => sum + epic.ticketsClosed,
        0,
      ),
      pullRequestsMerged: [...pace.values()].reduce(
        (sum, epic) => sum + epic.pullRequestsMerged,
        0,
      ),
    };

    return {
      since: props.since.toISOString(),
      previousBriefingAt: props.previousBriefingAt?.toISOString() ?? null,
      totals,
      changes: ranked
        .toSorted(BriefingChangeSections.bySubstance)
        .slice(0, briefingLimits.changes)
        .map(({ change }) => change),
    };
  }

  private static key(connectionId: string, nodeId: string): string {
    return `${connectionId}:${nodeId}`;
  }

  private static paceByEpic(props: {
    connections: readonly ConnectionObjectives[];
    since: Date;
  }): Map<string, EpicPace> {
    const closed = new Map<string, Set<string>>();
    const merged = new Map<string, Set<string>>();
    const add = (
      tickets: Map<string, Set<string>>,
      key: string,
      ticketNodeId: string,
    ) => tickets.set(key, (tickets.get(key) ?? new Set()).add(ticketNodeId));

    for (const { connectionId, records } of props.connections) {
      const epicOfTicket = new Map(
        records.tickets.map((ticket) => [ticket.nodeId, ticket.epicNodeId]),
      );
      for (const activity of records.activity) {
        const epicNodeId = epicOfTicket.get(activity.ticketNodeId);
        if (
          epicNodeId === undefined ||
          new Date(activity.occurredAt) < props.since
        ) {
          continue;
        }
        const key = BriefingChangeSections.key(connectionId, epicNodeId);
        if (activity.kind === 'ticket_closed') {
          add(closed, key, activity.ticketNodeId);
        } else if (activity.kind === 'pull_request_merged') {
          add(merged, key, activity.ticketNodeId);
        }
      }
    }

    const pace = new Map<string, EpicPace>();
    for (const key of new Set([...closed.keys(), ...merged.keys()])) {
      pace.set(key, {
        ticketsClosed: closed.get(key)?.size ?? 0,
        pullRequestsMerged: merged.get(key)?.size ?? 0,
      });
    }
    return pace;
  }

  private static ranked(props: {
    objectives: Objectives;
    since: Date;
    pace: ReadonlyMap<string, EpicPace>;
  }): { rank: number; change: BriefingChangeDraft }[] {
    const ranked: { rank: number; change: BriefingChangeDraft }[] = [];
    const seenEpics = new Set<string>();

    for (const initiative of props.objectives.initiatives) {
      if (BriefingChangeSections.closedSince(initiative, props.since)) {
        ranked.push({
          rank: substanceRank.initiativeClosed,
          change: BriefingChangeSections.change({
            kind: 'initiative',
            change: 'closed',
            objective: initiative,
            initiativeTitle: null,
            pace: noPace,
          }),
        });
      }

      for (const epic of initiative.epics) {
        const key = BriefingChangeSections.key(epic.connectionId, epic.id);
        if (seenEpics.has(key)) continue;
        seenEpics.add(key);

        const epicPace = props.pace.get(key) ?? noPace;
        const moved = BriefingChangeSections.epicMove({
          epic,
          since: props.since,
          pace: epicPace,
        });
        if (moved === null) continue;
        ranked.push({
          rank: substanceRank[moved === 'closed' ? 'epicClosed' : moved],
          change: BriefingChangeSections.change({
            kind: 'epic',
            change: moved,
            objective: epic,
            initiativeTitle: initiative.title,
            pace: epicPace,
          }),
        });
      }
    }
    return ranked;
  }

  private static epicMove(props: {
    epic: EpicObjective;
    since: Date;
    pace: EpicPace;
  }): BriefingChangeDraft['change'] | null {
    const { epic, pace } = props;
    if (epic.status === 'done') {
      return BriefingChangeSections.closedSince(epic, props.since)
        ? 'closed'
        : null;
    }
    const startedNow =
      epic.progress.source === 'tracker' &&
      epic.progress.done > 0 &&
      pace.ticketsClosed >= epic.progress.done;
    if (startedNow) return 'started';
    return pace.ticketsClosed > 0 || pace.pullRequestsMerged > 0
      ? 'progressed'
      : null;
  }

  private static closedSince(
    objective: InitiativeObjective | EpicObjective,
    since: Date,
  ): boolean {
    return (
      objective.status === 'done' && new Date(objective.lastActivityAt) >= since
    );
  }

  private static change(props: {
    kind: BriefingChangeDraft['kind'];
    change: BriefingChangeDraft['change'];
    objective: InitiativeObjective | EpicObjective;
    initiativeTitle: string | null;
    pace: EpicPace;
  }): BriefingChangeDraft {
    const { objective } = props;
    return {
      kind: props.kind,
      change: props.change,
      title: BriefingText.cap(objective.title, briefingLimits.titleLength),
      url: objective.url,
      initiativeTitle: BriefingText.capped(
        props.initiativeTitle,
        briefingLimits.titleLength,
      ),
      status: objective.status,
      progress: objective.progress,
      ticketsClosed: props.pace.ticketsClosed,
      pullRequestsMerged: props.pace.pullRequestsMerged,
    };
  }

  private static bySubstance(
    left: { rank: number; change: BriefingChangeDraft },
    right: { rank: number; change: BriefingChangeDraft },
  ): number {
    const volume = (item: { change: BriefingChangeDraft }) =>
      item.change.ticketsClosed + item.change.pullRequestsMerged;
    return (
      left.rank - right.rank ||
      volume(right) - volume(left) ||
      left.change.title.localeCompare(right.change.title)
    );
  }
}
