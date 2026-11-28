import { describe, expect, it } from 'vitest';
import type { GithubFeedDefaultBranch } from '#lib/api/github-feed-contracts.ts';
import type { WatchedChecks } from '#lib/api/watched-checks/watched-checks-contracts.ts';
import { SampleFeed } from '#lib/github-feed/__tests__/support/sample-feed.ts';
import {
  type RepositoryFilter,
  WatchedChecksView,
} from '#lib/watched-checks/watched-checks-view.ts';

class Repos {
  static branch(props: {
    fullName: string;
    watchedState: GithubFeedDefaultBranch['watchedState'];
    checks?: GithubFeedDefaultBranch['checks'];
  }): GithubFeedDefaultBranch {
    return SampleFeed.defaultBranch({
      repository: {
        fullName: props.fullName,
        url: `https://github.com/${props.fullName}`,
      },
      watchedState: props.watchedState,
      checks: props.checks ?? [],
    });
  }

  static chosen(overrides: Partial<WatchedChecks> = {}): WatchedChecks {
    return { rules: [], overrides: [], ...overrides };
  }

  static view(props: {
    branches: GithubFeedDefaultBranch[];
    chosen?: WatchedChecks;
    search?: string;
    filter?: RepositoryFilter;
  }) {
    return new WatchedChecksView({
      feed: SampleFeed.feed({ defaultBranches: props.branches }),
      chosen: props.chosen ?? Repos.chosen(),
      search: props.search,
      filter: props.filter,
    });
  }
}

const api = Repos.branch({
  fullName: 'acme-labs/api',
  watchedState: 'passing',
  checks: [
    SampleFeed.check({
      name: 'Deploy to Staging',
      watched: true,
      watchSource: 'rule',
    }),
    SampleFeed.check({ name: 'lint' }),
  ],
});
const web = Repos.branch({
  fullName: 'acme-labs/web',
  watchedState: 'failing',
  checks: [
    SampleFeed.check({
      name: 'Deploy to Staging',
      state: 'failure',
      watched: true,
      watchSource: 'rule',
    }),
  ],
});
const docs = Repos.branch({
  fullName: 'night-shift/docs',
  watchedState: 'none',
  checks: [SampleFeed.check({ name: 'lint' })],
});
const sample = [api, web, docs];
const webLintWatched = Repos.chosen({
  overrides: [
    { repository: 'acme-labs/web', checkName: 'lint', mode: 'watch' },
  ],
});

describe('WatchedChecksView rules', () => {
  it('says in how many repos each rule matches a check name', () => {
    const view = Repos.view({
      branches: sample,
      chosen: Repos.chosen({
        rules: [
          { id: 'r1', pattern: 'Deploy*' },
          { id: 'r2', pattern: 'lint' },
          { id: 'r3', pattern: 'release' },
        ],
      }),
    });

    expect(view.rules.map(({ pattern, reach }) => [pattern, reach])).toEqual([
      ['Deploy*', 'matches in 2 repos'],
      ['lint', 'matches in 2 repos'],
      ['release', 'matches in 0 repos'],
    ]);
  });

  it('says what a rule means, and “1 repo” in the singular', () => {
    const view = Repos.view({
      branches: [docs],
      chosen: Repos.chosen({
        rules: [
          { id: 'r1', pattern: 'Deploy*' },
          { id: 'r2', pattern: 'lint' },
        ],
      }),
    });

    expect(view.rules.map(({ meaning, reach }) => [meaning, reach])).toEqual([
      ['Check name starts with “Deploy”', 'matches in 0 repos'],
      ['Exact check name', 'matches in 1 repo'],
    ]);
  });
});

describe('WatchedChecksView repositories', () => {
  it('lists every repo with what it watches and how that stands', () => {
    const view = Repos.view({ branches: sample });

    expect(
      view.repositories.map(({ fullName, watching, stateLabel }) => [
        fullName,
        watching,
        stateLabel,
      ]),
    ).toEqual([
      ['acme-labs/api', 'Deploy to Staging', 'Passing'],
      ['acme-labs/web', 'Deploy to Staging', 'Failing'],
      ['night-shift/docs', 'Nothing watched', 'Nothing watched'],
    ]);
    expect(view.repositoryCount).toBe(3);
    expect(view.accountCount).toBe(2);
  });

  it('marks a repo custom when it has exceptions of its own', () => {
    const view = Repos.view({ branches: sample, chosen: webLintWatched });

    expect(
      view.repositories.map(({ fullName, custom }) => [fullName, custom]),
    ).toEqual([
      ['acme-labs/api', false],
      ['acme-labs/web', true],
      ['night-shift/docs', false],
    ]);
  });

  it.each([
    ['all', ['acme-labs/api', 'acme-labs/web', 'night-shift/docs']],
    ['custom', ['acme-labs/web']],
    ['failing', ['acme-labs/web']],
    ['nothing-watched', ['night-shift/docs']],
  ] as const)('filters by %s', (filter, expected) => {
    const view = Repos.view({
      branches: sample,
      filter,
      chosen: webLintWatched,
    });

    expect(view.repositories.map(({ fullName }) => fullName)).toEqual(expected);
  });
});

describe('WatchedChecksView search', () => {
  it('searches names without regard to case or whitespace around the query', () => {
    const view = Repos.view({ branches: sample, search: '  ACME-labs/W ' });

    expect(view.repositories.map(({ fullName }) => fullName)).toEqual([
      'acme-labs/web',
    ]);
  });

  it('counts each filter within the search', () => {
    const view = Repos.view({ branches: sample, search: 'acme' });

    expect(view.filters.map(({ label, count }) => [label, count])).toEqual([
      ['All', 2],
      ['Custom', 0],
      ['Failing', 1],
      ['Nothing watched', 0],
    ]);
  });

  it('narrows a hundred repos to the ones a search names', () => {
    const many = Array.from({ length: 120 }, (_, index) =>
      Repos.branch({
        fullName: `owner-${String(index % 4)}/repo-${String(index).padStart(3, '0')}`,
        watchedState: index % 10 === 0 ? 'failing' : 'none',
      }),
    );

    const everything = Repos.view({ branches: many });
    const narrowed = Repos.view({ branches: many, search: 'repo-07' });
    const failing = Repos.view({ branches: many, filter: 'failing' });

    expect(everything.repositories).toHaveLength(120);
    expect(narrowed.repositories).toHaveLength(10);
    expect(failing.repositories).toHaveLength(12);
    expect(everything.accountCount).toBe(4);
  });
});
