import { afterEach, describe, expect, it } from 'vitest';

import {
  ChosenWatchedChecks as Chosen,
  watchedChecksPath as path,
} from '#src/github-feed/__tests__/support/chosen-watched-checks.ts';
import {
  adaId,
  graceId,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { GithubFeedHarness } from '#src/github-feed/__tests__/support/github-feed-harness.ts';
import { ServedGithubFeed } from '#src/github-feed/__tests__/support/served-github-feed.ts';

const override = {
  repository: 'acme/app',
  checkName: 'build',
  mode: 'watch',
} as const;

afterEach(async () => {
  await ServedGithubFeed.stopAll();
});

describe('watched checks need a signed-in person', () => {
  it.each([
    ['GET', path, undefined],
    ['POST', `${path}/rules`, { pattern: 'build' }],
    ['DELETE', `${path}/rules/00000000-0000-4000-8000-0000000000aa`, undefined],
    ['PUT', `${path}/overrides`, override],
    [
      'DELETE',
      `${path}/overrides?repository=acme/app&checkName=build`,
      undefined,
    ],
  ] as const)('%s %s', async (method, url, payload) => {
    const harness = new GithubFeedHarness();
    ServedGithubFeed.track(harness);

    const response = await Chosen.request({
      harness,
      method,
      url,
      payload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  });
});

describe('adding watch rules', () => {
  it('starts with nothing chosen', async () => {
    const harness = await ServedGithubFeed.synced();

    expect(await Chosen.read({ harness, userId: adaId })).toEqual({
      rules: [],
      overrides: [],
    });
  });

  it('adds a rule once however often it is added', async () => {
    const harness = await ServedGithubFeed.synced();

    await Chosen.addRule({ harness, userId: adaId, pattern: 'Deploy*' });
    const chosen = await Chosen.addRule({
      harness,
      userId: adaId,
      pattern: ' Deploy* ',
    });

    expect(chosen.rules.map(({ pattern }) => pattern)).toEqual(['Deploy*']);
  });

  it.each(['', '   ', 'a*b', '**', '*build'])(
    'refuses the pattern %j',
    async (pattern) => {
      const harness = await ServedGithubFeed.synced();

      const response = await Chosen.request({
        harness,
        method: 'POST',
        url: `${path}/rules`,
        userId: adaId,
        payload: { pattern },
      });

      expect(response.statusCode).toBe(400);
    },
  );
});

describe('removing watch rules', () => {
  it('removes a rule', async () => {
    const harness = await ServedGithubFeed.synced();
    const added = await Chosen.addRule({
      harness,
      userId: adaId,
      pattern: 'build',
    });

    const response = await Chosen.request({
      harness,
      method: 'DELETE',
      url: `${path}/rules/${added.rules[0]?.id}`,
      userId: adaId,
    });

    expect(Chosen.parsed(response)).toEqual({ rules: [], overrides: [] });
  });

  it('keeps one person’s rules from another, who cannot remove them', async () => {
    const harness = await ServedGithubFeed.synced();
    const added = await Chosen.addRule({
      harness,
      userId: adaId,
      pattern: 'build',
    });

    const removal = await Chosen.request({
      harness,
      method: 'DELETE',
      url: `${path}/rules/${added.rules[0]?.id}`,
      userId: graceId,
    });

    expect((await Chosen.read({ harness, userId: graceId })).rules).toEqual([]);
    expect(removal.statusCode).toBe(404);
    expect(removal.json()).toMatchObject({ code: 'WATCH_RULE_NOT_FOUND' });
    expect((await Chosen.read({ harness, userId: adaId })).rules).toHaveLength(
      1,
    );
  });
});

describe('repository exceptions', () => {
  it('sets an exception, replaces it, and clears it', async () => {
    const harness = await ServedGithubFeed.synced();
    const set = await Chosen.setOverride({
      harness,
      userId: adaId,
      payload: override,
    });
    const replaced = await Chosen.setOverride({
      harness,
      userId: adaId,
      payload: { ...override, mode: 'ignore' },
    });
    const cleared = await Chosen.clearOverride({
      harness,
      userId: adaId,
      ...override,
    });

    expect(Chosen.parsed(set).overrides).toEqual([override]);
    expect(Chosen.parsed(replaced).overrides).toEqual([
      { ...override, mode: 'ignore' },
    ]);
    expect(Chosen.parsed(cleared).overrides).toEqual([]);
  });

  it('refuses a repository that is not owner/name, and an unknown mode', async () => {
    const harness = await ServedGithubFeed.synced();

    const statuses = await Promise.all(
      [
        { ...override, repository: 'app' },
        { ...override, mode: 'mute' },
      ].map(async (payload) =>
        Chosen.setOverride({ harness, userId: adaId, payload }),
      ),
    );

    expect(statuses.map(({ statusCode }) => statusCode)).toEqual([400, 400]);
  });

  it('touches only the signed-in person’s exceptions', async () => {
    const harness = await ServedGithubFeed.synced();
    await Chosen.setOverride({ harness, userId: adaId, payload: override });

    const cleared = await Chosen.clearOverride({
      harness,
      userId: graceId,
      ...override,
    });

    expect(Chosen.parsed(cleared).overrides).toEqual([]);
    expect((await Chosen.read({ harness, userId: adaId })).overrides).toEqual([
      override,
    ]);
  });
});

class Watched {
  static async stateOf(
    harness: Awaited<ReturnType<typeof ServedGithubFeed.synced>>,
    userId: string,
  ) {
    return (await ServedGithubFeed.feedOf(harness, userId)).defaultBranches[0]
      ?.watchedState;
  }
}

describe('the feed with watched checks', () => {
  it('has nothing watched until a rule or exception says so', async () => {
    const harness = await ServedGithubFeed.synced();

    expect(await Watched.stateOf(harness, adaId)).toBe('none');
  });

  it('is passing when a rule matches only the passing check, and failing once it matches the failing one', async () => {
    const harness = await ServedGithubFeed.synced();

    await Chosen.addRule({ harness, userId: adaId, pattern: 'codecov/*' });
    const passing = await ServedGithubFeed.feedOf(harness, adaId);
    await Chosen.addRule({ harness, userId: adaId, pattern: 'build' });
    const failing = await ServedGithubFeed.feedOf(harness, adaId);

    expect(passing.defaultBranches[0]?.watchedState).toBe('passing');
    expect(failing.defaultBranches[0]?.watchedState).toBe('failing');
    expect(
      failing.defaultBranches[0]?.checks.map(
        ({ name, watched, watchSource }) => [name, watched, watchSource],
      ),
    ).toEqual([
      ['build', true, 'rule'],
      ['codecov/patch', true, 'rule'],
    ]);
  });

  it('goes back to none when the repository ignores the watched check', async () => {
    const harness = await ServedGithubFeed.synced();
    await Chosen.addRule({ harness, userId: adaId, pattern: 'build' });

    await Chosen.setOverride({
      harness,
      userId: adaId,
      payload: { repository: 'acme/app', checkName: 'build', mode: 'ignore' },
    });

    expect(await Watched.stateOf(harness, adaId)).toBe('none');
  });

  it('is unaffected by what another person watches', async () => {
    const harness = await ServedGithubFeed.synced();

    await Chosen.addRule({ harness, userId: graceId, pattern: 'build' });

    expect(await Watched.stateOf(harness, adaId)).toBe('none');
  });
});
