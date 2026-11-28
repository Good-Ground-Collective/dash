import { z } from 'zod';
import type { InitiativeObjective } from '#lib/api/objectives-contracts.ts';
import type {
  GithubFeedPullRequest,
  GithubFeedRelease,
} from '#lib/api/github-feed-contracts.ts';
import { type FeedRow, FeedRows } from '#lib/github-feed/feed-rows.ts';
import {
  type EpicPlacement,
  TicketEpicLookup,
} from '#lib/home/ticket-epic-lookup.ts';
import type {
  SinceYesterdayGroup,
  SinceYesterdaySection,
} from '#lib/home/since-yesterday-group.ts';
import { ObjectiveRows } from '#lib/objectives/objective-rows.ts';
import type { ObjectivesState } from '#lib/objectives/objectives-view.ts';

const dayMs = 24 * 60 * 60 * 1000;

/** Home shows at most this many top-level items, however busy the day was. */
export const maxSinceYesterdayItems = 6;

export const sinceYesterdayGroupsPropsSchema = z.object({
  merges: z.array(z.custom<GithubFeedPullRequest>()),
  releases: z.array(z.custom<GithubFeedRelease>()),
  objectives: z.custom<ObjectivesState | null>(),
  now: z.date(),
});

export type SinceYesterdayGroupsProps = z.input<
  typeof sinceYesterdayGroupsPropsSchema
>;

/** What landed under one epic: the merges, and the distinct issues they closed. */
interface EpicMoves {
  placement: EpicPlacement;
  pulls: GithubFeedPullRequest[];
  closed: Set<string>;
}

/** The merges placed under each epic, and those placed under none. */
interface Attribution {
  byEpic: Map<string, EpicMoves>;
  unlinked: GithubFeedPullRequest[];
}

/** An epic or initiative item, with how many merges stand behind it. */
interface MovedItem {
  group: SinceYesterdayGroup;
  merged: number;
}

/**
 * The last day's merges and releases grouped by what moved: the initiatives and epics that
 * closed, the epics that progressed, the releases, and the merges that close nothing an epic owns.
 */
export class SinceYesterdayGroups {
  private readonly merges: GithubFeedPullRequest[];
  private readonly releases: GithubFeedRelease[];
  private readonly lookup: TicketEpicLookup;

  constructor(props: SinceYesterdayGroupsProps) {
    const valid = sinceYesterdayGroupsPropsSchema.parse(props);
    const since = valid.now.getTime() - dayMs;
    this.merges = valid.merges.filter(
      (pull) => (pull.mergedAt?.getTime() ?? 0) >= since,
    );
    this.releases = valid.releases.filter(
      (release) => release.publishedAt.getTime() >= since,
    );
    this.lookup = new TicketEpicLookup({ objectives: valid.objectives });
  }

  /** At most `maxSinceYesterdayItems` items. The smallest epics fold into one “N more epics” item before Releases or Other merges would be cut. */
  get groups(): SinceYesterdayGroup[] {
    const { byEpic, unlinked } = this.attribute();
    const releases = this.releaseGroup();
    const others = SinceYesterdayGroups.otherMergesGroup(unlinked);
    const reserved = (releases === null ? 0 : 1) + (others === null ? 0 : 1);

    const moved = SinceYesterdayGroups.movedItems(byEpic);
    const epicSlots = maxSinceYesterdayItems - reserved;
    const epics =
      moved.length <= epicSlots
        ? moved.map(({ group }) => group)
        : [
            ...moved.slice(0, epicSlots - 1).map(({ group }) => group),
            SinceYesterdayGroups.moreEpicsGroup(moved.slice(epicSlots - 1)),
          ];

    return [
      ...epics,
      ...(releases === null ? [] : [releases]),
      ...(others === null ? [] : [others]),
    ];
  }

  /** Each merge goes to the first epic one of its closing issues is a task of, and to Other merges when none is. */
  private attribute(): Attribution {
    const byEpic = new Map<string, EpicMoves>();
    const unlinked: GithubFeedPullRequest[] = [];
    const newestFirst = this.merges.toSorted(
      (a, b) => (b.mergedAt?.getTime() ?? 0) - (a.mergedAt?.getTime() ?? 0),
    );

    for (const pull of newestFirst) {
      const placed = pull.closingIssues.flatMap((issue) => {
        const placement = this.lookup.placementOf(issue);
        return placement === null ? [] : [{ issue, placement }];
      });
      const first = placed[0];
      if (first === undefined) {
        unlinked.push(pull);
        continue;
      }

      const { epic } = first.placement;
      const moves = byEpic.get(epic.id) ?? {
        placement: first.placement,
        pulls: [],
        closed: new Set<string>(),
      };
      moves.pulls.push(pull);
      for (const { issue, placement } of placed) {
        if (placement.epic.id === epic.id) {
          moves.closed.add(TicketEpicLookup.key(issue));
        }
      }
      byEpic.set(epic.id, moves);
    }
    return { byEpic, unlinked };
  }

  private releaseGroup(): SinceYesterdayGroup | null {
    if (this.releases.length === 0) return null;
    const rows = this.releases
      .map((release) => FeedRows.release(release))
      .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return {
      id: 'releases',
      kind: 'releases',
      title: 'Releases',
      href: null,
      summary: `${String(rows.length)} ${rows.length === 1 ? 'release' : 'releases'}`,
      progress: null,
      sections: [{ id: 'releases', title: null, summary: null, rows }],
    };
  }

  /** Closed initiatives, then closed epics, then the epics that progressed, most merges first. */
  private static movedItems(byEpic: Map<string, EpicMoves>): MovedItem[] {
    const all = [...byEpic.values()];
    const initiatives = new Map<
      string,
      { initiative: InitiativeObjective; moves: EpicMoves[] }
    >();
    for (const moves of all) {
      const { initiative } = moves.placement;
      if (initiative.status === 'done') {
        const entry = initiatives.get(initiative.id) ?? {
          initiative,
          moves: [],
        };
        entry.moves.push(moves);
        initiatives.set(initiative.id, entry);
      }
    }
    const rest = all.filter(
      ({ placement }) => !initiatives.has(placement.initiative.id),
    );

    return [
      ...[...initiatives.values()].map(({ initiative, moves }) =>
        SinceYesterdayGroups.initiativeItem({ initiative, moves }),
      ),
      ...rest
        .filter(({ placement }) => placement.epic.status === 'done')
        .map((moves) => SinceYesterdayGroups.epicItem(moves)),
      ...rest
        .filter(({ placement }) => placement.epic.status !== 'done')
        .toSorted((a, b) => b.pulls.length - a.pulls.length)
        .map((moves) => SinceYesterdayGroups.epicItem(moves)),
    ];
  }

  private static epicItem(moves: EpicMoves): MovedItem {
    const { epic } = moves.placement;
    const row = ObjectiveRows.of(epic);
    const id = `epic:${epic.id}`;
    return {
      merged: moves.pulls.length,
      group: {
        id,
        kind: 'epic',
        title: row.title,
        href: row.href,
        summary: SinceYesterdayGroups.movedSummary([moves]),
        progress: row.progress,
        sections: [
          {
            id,
            title: null,
            summary: null,
            rows: SinceYesterdayGroups.mergeRows(moves.pulls),
          },
        ],
      },
    };
  }

  private static initiativeItem(props: {
    initiative: InitiativeObjective;
    moves: EpicMoves[];
  }): MovedItem {
    const movesOfEpics = props.moves;
    const row = ObjectiveRows.of(props.initiative);
    const id = `initiative:${row.id}`;
    return {
      merged: movesOfEpics.reduce((sum, { pulls }) => sum + pulls.length, 0),
      group: {
        id,
        kind: 'initiative',
        title: row.title,
        href: row.href,
        summary: SinceYesterdayGroups.movedSummary(movesOfEpics),
        progress: row.progress,
        sections: movesOfEpics.map((moves): SinceYesterdaySection => ({
          id: `epic:${moves.placement.epic.id}`,
          title: moves.placement.epic.title,
          summary: SinceYesterdayGroups.movedSummary([moves]),
          rows: SinceYesterdayGroups.mergeRows(moves.pulls),
        })),
      },
    };
  }

  private static moreEpicsGroup(folded: MovedItem[]): SinceYesterdayGroup {
    const onlyEpics = folded.every(({ group }) => group.kind === 'epic');
    const merged = folded.reduce((sum, item) => sum + item.merged, 0);
    return {
      id: 'more-epics',
      kind: 'more-epics',
      title: onlyEpics
        ? `${String(folded.length)} more epics`
        : `${String(folded.length)} more initiatives and epics`,
      href: null,
      summary: `${String(merged)} merged`,
      progress: null,
      sections: folded.map(({ group }): SinceYesterdaySection => ({
        id: group.id,
        title: group.title,
        summary: group.summary,
        rows: group.sections
          .flatMap(({ rows }) => rows)
          .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      })),
    };
  }

  private static otherMergesGroup(
    pulls: GithubFeedPullRequest[],
  ): SinceYesterdayGroup | null {
    if (pulls.length === 0) return null;
    return {
      id: 'other-merges',
      kind: 'other-merges',
      title: 'Other merges',
      href: null,
      summary: `${String(pulls.length)} merged`,
      progress: null,
      sections: [
        {
          id: 'other-merges',
          title: null,
          summary: null,
          rows: SinceYesterdayGroups.mergeRows(pulls),
        },
      ],
    };
  }

  private static movedSummary(movesOfEpics: EpicMoves[]): string {
    const merged = movesOfEpics.reduce(
      (sum, { pulls }) => sum + pulls.length,
      0,
    );
    const closed = movesOfEpics.reduce(
      (sum, moves) => sum + moves.closed.size,
      0,
    );
    return `${String(merged)} merged · ${String(closed)} closed`;
  }

  private static mergeRows(pulls: GithubFeedPullRequest[]): FeedRow[] {
    return pulls
      .map((pull) => FeedRows.mergedPullRequest(pull))
      .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
