import { describe, expect, it } from 'vitest';
import { EnvironmentBuildStamp } from '#lib/build/build-stamp.ts';

const sha = '7615036f0c2b9a8e1d4f5a6b7c8d9e0f1a2b3c4d';

describe('EnvironmentBuildStamp formatting', () => {
  it('links a release tag and shortens the commit to seven characters', () => {
    expect(
      EnvironmentBuildStamp.from({ version: 'v1.1.1', commit: sha }),
    ).toEqual({
      version: 'v1.1.1',
      releaseUrl:
        'https://github.com/Good-Ground-Collective/dash/releases/tag/v1.1.1',
      shortCommit: '7615036',
      commitUrl: `https://github.com/Good-Ground-Collective/dash/commit/${sha}`,
    });
  });

  it('links a prerelease tag', () => {
    expect(
      EnvironmentBuildStamp.from({ version: 'v2.0.0-beta.1', commit: sha })
        .releaseUrl,
    ).toBe(
      'https://github.com/Good-Ground-Collective/dash/releases/tag/v2.0.0-beta.1',
    );
  });
});

describe('EnvironmentBuildStamp fallback', () => {
  it('shows dev and no commit when nothing is set', () => {
    expect(EnvironmentBuildStamp.from({})).toEqual({
      version: 'dev',
      releaseUrl: null,
      shortCommit: null,
      commitUrl: null,
    });
  });

  it.each([
    ['blank', '  ', ''],
    ['undefined', undefined, undefined],
  ])('treats %s values as unset', (_label, version, commit) => {
    expect(EnvironmentBuildStamp.from({ version, commit })).toMatchObject({
      version: 'dev',
      shortCommit: null,
    });
  });

  it('keeps the commit of an untagged local build', () => {
    expect(
      EnvironmentBuildStamp.from({ version: 'dev', commit: sha }),
    ).toMatchObject({
      version: 'dev',
      releaseUrl: null,
      shortCommit: '7615036',
    });
  });

  it.each(['main', 'not-a-sha', 'abc', `${sha}0`])(
    'drops the malformed commit %j',
    (commit) => {
      expect(
        EnvironmentBuildStamp.from({ version: 'v1.1.1', commit }),
      ).toMatchObject({
        shortCommit: null,
        commitUrl: null,
      });
    },
  );

  it('shows a version that is not a release tag without linking it', () => {
    expect(
      EnvironmentBuildStamp.from({ version: 'local', commit: sha }),
    ).toMatchObject({
      version: 'local',
      releaseUrl: null,
    });
  });
});
