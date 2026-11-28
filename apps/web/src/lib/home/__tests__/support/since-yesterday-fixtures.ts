import type { GithubFeedPullRequest } from '#lib/api/github-feed-contracts.ts';
import type { EpicObjective } from '#lib/api/objectives-contracts.ts';
import { SampleFeed } from '#lib/github-feed/__tests__/support/sample-feed.ts';
import { SinceYesterdayGroups } from '#lib/home/since-yesterday-groups.ts';
import { SampleObjectives } from '#lib/objectives/__tests__/support/sample-objectives.ts';
import type { ObjectivesState } from '#lib/objectives/objectives-view.ts';

export const now = new Date('2026-11-27T12:00:00Z');

/** Epics, merges and the grouping call for the Since yesterday tests, with only what a test cares about spelled out. */
export class Fixtures {
  static hoursAgo(hours: number): Date {
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  }

  /** An epic whose tasks are issues #`first` upwards in acme-labs/api, and whose own issue is #`own`. */
  static epic(props: {
    id: string;
    own: number;
    first: number;
    tasks?: number;
    overrides?: Partial<EpicObjective>;
  }): EpicObjective {
    const count = props.tasks ?? 3;
    return SampleObjectives.epic({
      id: props.id,
      title: `Epic ${props.id}`,
      url: `https://github.com/acme-labs/api/issues/${String(props.own)}`,
      tasks: {
        items: Array.from({ length: count }, (_, index) => ({
          id: `${props.id}-${String(index)}`,
          title: `Task ${String(props.first + index)}`,
          url: `https://github.com/acme-labs/api/issues/${String(props.first + index)}`,
          state: 'open' as const,
          assignees: [],
        })),
        total: count,
      },
      ...props.overrides,
    });
  }

  static state(
    initiatives: ReturnType<typeof SampleObjectives.initiative>[],
  ): ObjectivesState {
    return {
      status: 'loaded',
      objectives: SampleObjectives.objectives({ initiatives }),
      githubConnected: true,
      anyInitiative: true,
    };
  }

  static merge(props: {
    id: string;
    closes?: number[];
    hours?: number;
  }): GithubFeedPullRequest {
    return SampleFeed.pull({
      id: props.id,
      state: 'merged',
      mergedAt: Fixtures.hoursAgo(props.hours ?? 2),
      closingIssues: (props.closes ?? []).map((number) => ({
        repository: 'acme-labs/api',
        number,
      })),
    });
  }

  static groups(props: {
    merges: GithubFeedPullRequest[];
    objectives: ObjectivesState | null;
    releases?: ReturnType<typeof SampleFeed.release>[];
  }) {
    return new SinceYesterdayGroups({
      merges: props.merges,
      releases: props.releases ?? [],
      objectives: props.objectives,
      now,
    }).groups;
  }

  /** For each count, that many merges closing the first task of the epic made by `Fixtures.epic` with the matching index. */
  static mergesFor(counts: number[]): GithubFeedPullRequest[] {
    return counts.flatMap((count, index) =>
      Array.from({ length: count }, (_, copy) =>
        Fixtures.merge({
          id: `m-${String(index)}-${String(copy)}`,
          closes: [100 * (index + 1)],
        }),
      ),
    );
  }
}
