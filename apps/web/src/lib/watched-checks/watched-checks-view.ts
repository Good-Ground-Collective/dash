import { z } from 'zod';
import type {
  GithubFeed,
  GithubFeedDefaultBranch,
  WatchedState,
} from '#lib/api/github-feed-contracts.ts';
import type { WatchedChecks } from '#lib/api/watched-checks/watched-checks-contracts.ts';
import { WatchPattern } from '#lib/watched-checks/watch-pattern.ts';

export const repositoryFilters = [
  'all',
  'custom',
  'failing',
  'nothing-watched',
] as const;

export type RepositoryFilter = (typeof repositoryFilters)[number];

/** What the page got from Mission Control: the feed and the person's choices, or `failed` when either didn't answer. */
export type WatchedChecksState =
  | { status: 'loaded'; feed: GithubFeed; chosen: WatchedChecks }
  | { status: 'failed' };

export interface RuleRow {
  id: string;
  pattern: string;
  meaning: string;
  /** “matches in 3 repos”. */
  reach: string;
}

export interface RepositoryRow {
  fullName: string;
  owner: string;
  name: string;
  /** The names of the watched checks, or “Nothing watched”. */
  watching: string;
  watchedState: WatchedState;
  stateLabel: string;
  /** The repository has exceptions of its own to the rules. */
  custom: boolean;
}

export interface FilterOption {
  filter: RepositoryFilter;
  label: string;
  count: number;
}

const stateLabels = {
  failing: 'Failing',
  pending: 'Pending',
  passing: 'Passing',
  none: 'Nothing watched',
} satisfies Record<WatchedState, string>;

const filterLabels = {
  all: 'All',
  custom: 'Custom',
  failing: 'Failing',
  'nothing-watched': 'Nothing watched',
} satisfies Record<RepositoryFilter, string>;

export const watchedChecksViewPropsSchema = z.object({
  feed: z.custom<GithubFeed>(),
  chosen: z.custom<WatchedChecks>(),
  search: z.string().trim().toLowerCase().default(''),
  filter: z.enum(repositoryFilters).default('all'),
});

export type WatchedChecksViewProps = z.input<
  typeof watchedChecksViewPropsSchema
>;

/** The rules and the repositories Dash reads, as Settings shows them: the rules with their reach, and the repositories narrowed by what was typed and the filter picked. */
export class WatchedChecksView {
  private readonly branches: readonly GithubFeedDefaultBranch[];
  private readonly chosen: WatchedChecks;
  private readonly search: string;
  private readonly filter: RepositoryFilter;
  private readonly customRepositories: ReadonlySet<string>;

  constructor(props: WatchedChecksViewProps) {
    const valid = watchedChecksViewPropsSchema.parse(props);
    this.branches = valid.feed.defaultBranches;
    this.chosen = valid.chosen;
    this.search = valid.search;
    this.filter = valid.filter;
    this.customRepositories = new Set(
      valid.chosen.overrides.map(({ repository }) => repository),
    );
  }

  get rules(): RuleRow[] {
    return this.chosen.rules.map(({ id, pattern }) => ({
      id,
      pattern,
      meaning: WatchPattern.meaning(pattern),
      reach: WatchedChecksView.reachOf({
        count: this.branches.filter((branch) =>
          branch.checks.some(({ name }) =>
            WatchPattern.matches({ pattern, checkName: name }),
          ),
        ).length,
      }),
    }));
  }

  /** Every repository Dash read the default branch of, whatever is typed or picked. */
  get repositoryCount(): number {
    return this.branches.length;
  }

  /** How many accounts own the repositories. */
  get accountCount(): number {
    return new Set(this.branches.map((branch) => this.rowOf(branch).owner))
      .size;
  }

  get filters(): FilterOption[] {
    const rows = this.branches
      .map((branch) => this.rowOf(branch))
      .filter((row) => this.matchesSearch(row));
    return repositoryFilters.map((filter) => ({
      filter,
      label: filterLabels[filter],
      count: rows.filter((row) => WatchedChecksView.passes({ filter, row }))
        .length,
    }));
  }

  /** The repositories that match the search and the filter, by name. */
  get repositories(): RepositoryRow[] {
    return this.branches
      .map((branch) => this.rowOf(branch))
      .filter(
        (row) =>
          this.matchesSearch(row) &&
          WatchedChecksView.passes({ filter: this.filter, row }),
      );
  }

  private rowOf(branch: GithubFeedDefaultBranch): RepositoryRow {
    const { fullName } = branch.repository;
    const [owner = '', name = ''] = fullName.split('/');
    const watched = branch.checks.filter((check) => check.watched);
    return {
      fullName,
      owner,
      name,
      watching:
        watched.length === 0
          ? 'Nothing watched'
          : watched.map((check) => check.name).join(', '),
      watchedState: branch.watchedState,
      stateLabel: stateLabels[branch.watchedState],
      custom: this.customRepositories.has(fullName),
    };
  }

  private matchesSearch(row: RepositoryRow): boolean {
    return row.fullName.toLowerCase().includes(this.search);
  }

  private static passes(props: {
    filter: RepositoryFilter;
    row: RepositoryRow;
  }): boolean {
    if (props.filter === 'custom') {
      return props.row.custom;
    }
    if (props.filter === 'failing') {
      return props.row.watchedState === 'failing';
    }
    if (props.filter === 'nothing-watched') {
      return props.row.watchedState === 'none';
    }
    return true;
  }

  private static reachOf(props: { count: number }): string {
    return `matches in ${String(props.count)} ${props.count === 1 ? 'repo' : 'repos'}`;
  }
}
