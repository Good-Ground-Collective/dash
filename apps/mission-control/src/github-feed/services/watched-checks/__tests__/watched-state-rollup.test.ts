import { describe, expect, it } from 'vitest';

import { WatchedStateRollup } from '#src/github-feed/services/watched-checks/watched-state-rollup.ts';

class Checks {
  static of(
    state: 'success' | 'failure' | 'pending' | 'neutral' | 'skipped',
    watched = true,
  ) {
    return { state, watched };
  }
}

describe('WatchedStateRollup', () => {
  it('is none when nothing is watched, whatever the other checks do', () => {
    expect(WatchedStateRollup.of([])).toBe('none');
    expect(
      WatchedStateRollup.of([
        Checks.of('failure', false),
        Checks.of('pending', false),
      ]),
    ).toBe('none');
  });

  it('is failing when any watched check fails, even beside a pending one', () => {
    expect(
      WatchedStateRollup.of([
        Checks.of('success'),
        Checks.of('pending'),
        Checks.of('failure'),
      ]),
    ).toBe('failing');
  });

  it('is pending when a watched check is still running and none failed', () => {
    expect(
      WatchedStateRollup.of([Checks.of('success'), Checks.of('pending')]),
    ).toBe('pending');
  });

  it('is passing when every watched check passed, was neutral or skipped', () => {
    expect(
      WatchedStateRollup.of([
        Checks.of('success'),
        Checks.of('neutral'),
        Checks.of('skipped'),
      ]),
    ).toBe('passing');
  });

  it('ignores an unwatched failure beside a passing watched check', () => {
    expect(
      WatchedStateRollup.of([
        Checks.of('success'),
        Checks.of('failure', false),
      ]),
    ).toBe('passing');
  });
});
