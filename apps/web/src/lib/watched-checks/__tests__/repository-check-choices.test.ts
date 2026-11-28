import { describe, expect, it } from 'vitest';
import { SampleFeed } from '#lib/github-feed/__tests__/support/sample-feed.ts';
import {
  type CheckChoice,
  RepositoryCheckChoices,
} from '#lib/watched-checks/repository-check-choices.ts';

const branch = SampleFeed.defaultBranch({
  checks: [
    SampleFeed.check({ name: 'build', state: 'failure' }),
    SampleFeed.check({ name: 'Deploy to Staging', state: 'success' }),
    SampleFeed.check({ name: 'lint', state: 'pending' }),
  ],
});
const chosen = {
  rules: [{ id: 'r1', pattern: 'Deploy*' }],
  overrides: [
    { repository: 'acme-labs/api', checkName: 'lint', mode: 'watch' },
    { repository: 'acme-labs/api', checkName: 'build', mode: 'ignore' },
    { repository: 'acme-labs/web', checkName: 'lint', mode: 'ignore' },
  ],
} as const;

describe('RepositoryCheckChoices.rows', () => {
  it('lists the latest run’s checks with their last state, the repo’s own answer and what the rules say', () => {
    expect(
      RepositoryCheckChoices.rows({
        branch,
        chosen: { rules: [...chosen.rules], overrides: [...chosen.overrides] },
      }),
    ).toEqual([
      {
        name: 'build',
        last: 'Failed',
        failing: true,
        choice: 'ignore',
        rulesWatch: false,
      },
      {
        name: 'Deploy to Staging',
        last: 'Passed',
        failing: false,
        choice: 'rules',
        rulesWatch: true,
      },
      {
        name: 'lint',
        last: 'Running',
        failing: false,
        choice: 'watch',
        rulesWatch: false,
      },
    ]);
  });
});

describe('RepositoryCheckChoices.rows for answers the latest run no longer has', () => {
  it('lists them after the latest run’s checks, so choosing Rules can clear them', () => {
    const rows = RepositoryCheckChoices.rows({
      branch,
      chosen: {
        rules: [{ id: 'r1', pattern: 'Deploy*' }],
        overrides: [
          {
            repository: 'acme-labs/api',
            checkName: 'Deploy old',
            mode: 'ignore',
          },
          { repository: 'acme-labs/web', checkName: 'gone', mode: 'watch' },
        ],
      },
    });

    expect(rows.map(({ name }) => name)).toEqual([
      'build',
      'Deploy to Staging',
      'lint',
      'Deploy old',
    ]);
    expect(rows[3]).toEqual({
      name: 'Deploy old',
      last: 'Not in the latest run',
      failing: false,
      choice: 'ignore',
      rulesWatch: true,
    });
  });
});

describe('RepositoryCheckChoices.changes', () => {
  const submit = (answers: Record<string, CheckChoice>) =>
    RepositoryCheckChoices.changes({
      repository: 'acme-labs/api',
      chosen: { rules: [...chosen.rules], overrides: [...chosen.overrides] },
      submitted: new Map(Object.entries(answers)),
    });

  it('changes nothing when every answer stays', () => {
    expect(
      submit({ build: 'ignore', 'Deploy to Staging': 'rules', lint: 'watch' }),
    ).toEqual({ set: [], clear: [] });
  });

  it('sets a new exception, replaces another, and clears one that goes back to the rules', () => {
    expect(
      submit({ build: 'rules', 'Deploy to Staging': 'ignore', lint: 'ignore' }),
    ).toEqual({
      set: [
        { checkName: 'Deploy to Staging', mode: 'ignore' },
        { checkName: 'lint', mode: 'ignore' },
      ],
      clear: [{ checkName: 'build' }],
    });
  });

  it('leaves the answers for checks the latest run no longer has, and other repos', () => {
    expect(submit({ 'Deploy to Staging': 'watch' })).toEqual({
      set: [{ checkName: 'Deploy to Staging', mode: 'watch' }],
      clear: [],
    });
  });
});
