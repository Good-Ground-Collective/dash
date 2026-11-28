import { describe, expect, it } from 'vitest';
import { WatchPattern } from '#lib/watched-checks/watch-pattern.ts';

describe('WatchPattern.matches', () => {
  it.each([
    ['release', 'release', true],
    ['release', 'release-notes', false],
    ['Deploy*', 'Deploy to Staging', true],
    ['Deploy*', 'Deploy', true],
    ['Deploy*', 'deploy to staging', false],
    ['*', 'anything', true],
  ])('%s against %s is %s', (pattern, checkName, expected) => {
    expect(WatchPattern.matches({ pattern, checkName })).toBe(expected);
  });
});

describe('WatchPattern.meaning', () => {
  it.each([
    ['release', 'Exact check name'],
    ['Deploy*', 'Check name starts with “Deploy”'],
    ['*', 'Every check'],
  ])('%s means %s', (pattern, expected) => {
    expect(WatchPattern.meaning(pattern)).toBe(expected);
  });
});
