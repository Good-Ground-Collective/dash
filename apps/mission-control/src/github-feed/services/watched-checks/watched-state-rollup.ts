import type { WatchedState } from '#src/github-feed/contracts/watched-checks.ts';

/** How a default branch's watched checks add up. Checks nobody watches never count. */
export class WatchedStateRollup {
  static of(
    checks: readonly {
      watched: boolean;
      state: 'success' | 'failure' | 'pending' | 'neutral' | 'skipped';
    }[],
  ): WatchedState {
    const watched = checks.filter((check) => check.watched);
    if (watched.length === 0) {
      return 'none';
    }
    if (watched.some(({ state }) => state === 'failure')) {
      return 'failing';
    }
    if (watched.some(({ state }) => state === 'pending')) {
      return 'pending';
    }
    return 'passing';
  }
}
