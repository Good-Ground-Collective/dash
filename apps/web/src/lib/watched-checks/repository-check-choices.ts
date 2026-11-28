import { z } from 'zod';
import type { GithubFeedDefaultBranch } from '#lib/api/github-feed-contracts.ts';
import type {
  WatchedChecks,
  WatchMode,
} from '#lib/api/watched-checks/watched-checks-contracts.ts';
import { WatchPattern } from '#lib/watched-checks/watch-pattern.ts';

export const checkChoiceSchema = z.enum(['rules', 'watch', 'ignore']);

/** What a repository says about one check: follow the rules for every repository, or watch it or ignore it regardless. */
export type CheckChoice = z.infer<typeof checkChoiceSchema>;

export interface CheckChoiceRow {
  name: string;
  /** The check's state on the latest default-branch run, in words. */
  last: string;
  failing: boolean;
  choice: CheckChoice;
  /** Whether the rules alone would watch it, so “Rules” can say what it means for this check. */
  rulesWatch: boolean;
}

export interface CheckChanges {
  set: { checkName: string; mode: WatchMode }[];
  clear: { checkName: string }[];
}

const lastLabels = {
  success: 'Passed',
  failure: 'Failed',
  pending: 'Running',
  neutral: 'Neutral',
  skipped: 'Skipped',
} as const;

/** One repository's checks from its latest default-branch run, with what the person has said about each, and what saving a new set of answers would change. */
export class RepositoryCheckChoices {
  static rows(props: {
    branch: GithubFeedDefaultBranch;
    chosen: WatchedChecks;
  }): CheckChoiceRow[] {
    const { branch, chosen } = props;
    const said = new Map(
      chosen.overrides
        .filter(({ repository }) => repository === branch.repository.fullName)
        .map(({ checkName, mode }) => [checkName, mode]),
    );
    return branch.checks.map((check) => ({
      name: check.name,
      last: lastLabels[check.state],
      failing: check.state === 'failure',
      choice: said.get(check.name) ?? 'rules',
      rulesWatch: chosen.rules.some(({ pattern }) =>
        WatchPattern.matches({ pattern, checkName: check.name }),
      ),
    }));
  }

  /** What differs from `chosen` for the checks in `submitted`. Checks not named, such as ones the latest run no longer has, keep what they have. */
  static changes(props: {
    repository: string;
    chosen: WatchedChecks;
    submitted: ReadonlyMap<string, CheckChoice>;
  }): CheckChanges {
    const said = new Map(
      props.chosen.overrides
        .filter(({ repository }) => repository === props.repository)
        .map(({ checkName, mode }) => [checkName, mode]),
    );
    const changes: CheckChanges = { set: [], clear: [] };
    for (const [checkName, choice] of props.submitted) {
      const before = said.get(checkName) ?? 'rules';
      if (choice === before) {
        continue;
      }
      if (choice === 'rules') {
        changes.clear.push({ checkName });
      } else {
        changes.set.push({ checkName, mode: choice });
      }
    }
    return changes;
  }
}
