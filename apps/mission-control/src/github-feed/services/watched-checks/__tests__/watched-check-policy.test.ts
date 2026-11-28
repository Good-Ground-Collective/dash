import { describe, expect, it } from 'vitest';

import { WatchedCheckPolicy } from '#src/github-feed/services/watched-checks/watched-check-policy.ts';

const app = 'acme/app';

describe('WatchedCheckPolicy rules', () => {
  const policy = new WatchedCheckPolicy({ rules: ['release', 'Deploy*'] });

  it('watches a check whose name a rule gives exactly', () => {
    expect(policy.watchSource({ repository: app, checkName: 'release' })).toBe(
      'rule',
    );
    expect(
      policy.watchSource({ repository: app, checkName: 'release-notes' }),
    ).toBeNull();
  });

  it('watches every check a prefix rule starts', () => {
    expect(
      policy.watchSource({ repository: app, checkName: 'Deploy to Staging' }),
    ).toBe('rule');
    expect(policy.watchSource({ repository: app, checkName: 'Deploy' })).toBe(
      'rule',
    );
    expect(
      policy.watchSource({ repository: app, checkName: 'deploy to staging' }),
    ).toBeNull();
  });

  it('applies to every repository alike', () => {
    expect(
      policy.watchSource({ repository: 'acme/web', checkName: 'Deploy prod' }),
    ).toBe('rule');
  });

  it('watches everything for a lone *, and nothing without rules', () => {
    expect(
      new WatchedCheckPolicy({ rules: ['*'] }).watchSource({
        repository: app,
        checkName: 'lint',
      }),
    ).toBe('rule');
    expect(
      new WatchedCheckPolicy().watchSource({
        repository: app,
        checkName: 'lint',
      }),
    ).toBeNull();
  });
});

describe('WatchedCheckPolicy repository exceptions', () => {
  const policy = new WatchedCheckPolicy({
    rules: ['Deploy*'],
    overrides: [
      { repository: app, checkName: 'lint', mode: 'watch' },
      { repository: app, checkName: 'Deploy to Staging', mode: 'ignore' },
    ],
  });

  it('watches a check the rules skip when the repository says to', () => {
    expect(policy.watchSource({ repository: app, checkName: 'lint' })).toBe(
      'repo',
    );
  });

  it('ignores a check the rules match when the repository says to', () => {
    expect(
      policy.watchSource({ repository: app, checkName: 'Deploy to Staging' }),
    ).toBeNull();
    expect(
      policy.watchSource({ repository: app, checkName: 'Deploy to Prod' }),
    ).toBe('rule');
  });

  it('keeps an exception to the repository it was made for', () => {
    expect(
      policy.watchSource({ repository: 'acme/web', checkName: 'lint' }),
    ).toBeNull();
    expect(
      policy.watchSource({
        repository: 'acme/web',
        checkName: 'Deploy to Staging',
      }),
    ).toBe('rule');
  });

  it('says watch when a repository watches a check the rules also match', () => {
    const both = new WatchedCheckPolicy({
      rules: ['lint'],
      overrides: [{ repository: app, checkName: 'lint', mode: 'watch' }],
    });

    expect(both.watchSource({ repository: app, checkName: 'lint' })).toBe(
      'repo',
    );
  });
});
