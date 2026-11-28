import { setImmediate as nextTurn } from 'node:timers/promises';

import { vi } from 'vitest';

import type { RelayOutcome } from '#src/services/heartbeat-relay/heartbeat-relay.js';

/**
 * Moves fake time forward one timer at a time, with real turns of the event loop before each step
 * so the relay's I/O finishes before its next poll or backoff fires. A hung relay fails with a
 * message, not a test timeout, by bounds on the relay and not the machine: `MAX_STEPS` fired
 * timers for a relay that never exits, and `MAX_IDLE_MS` of real time since the last timer fired
 * for one waiting on I/O that never finishes (under vitest's default 5 s test timeout).
 */
export class FakeTimers {
  private static readonly MAX_STEPS = 1_000;
  private static readonly MAX_IDLE_MS = 3_000;

  static async runUntil<T>(work: Promise<T>): Promise<T> {
    for (let fired = 0; ; fired += 1) {
      if (!(await FakeTimers.untilTimerPending(work))) {
        return work;
      }
      if (fired >= FakeTimers.MAX_STEPS) {
        throw new Error(
          `Relay still running after ${FakeTimers.MAX_STEPS} fired timers; it looks hung.`,
        );
      }
      await vi.advanceTimersToNextTimerAsync();
    }
  }

  /** Fires `count` timers, then returns once the next one is pending, leaving it unfired. */
  static async fire(
    running: Promise<RelayOutcome>,
    count: number,
  ): Promise<void> {
    for (let fired = 0; ; fired += 1) {
      if (!(await FakeTimers.untilTimerPending(running))) {
        const [outcome] = await Promise.allSettled([running]);
        if (outcome?.status === 'rejected') {
          throw new Error(
            `Relay rejected after ${fired} of ${count} timers fired: ${String(outcome.reason)}`,
            { cause: outcome.reason },
          );
        }
        throw new Error(
          `Relay settled after ${fired} of ${count} timers fired, with the next still to come.`,
        );
      }
      if (fired === count) {
        return;
      }
      await vi.advanceTimersToNextTimerAsync();
    }
  }

  /** Whether a fake timer is pending, or false once `work` has settled; rejects when neither happens within `MAX_IDLE_MS`. */
  private static async untilTimerPending(
    work: Promise<unknown>,
  ): Promise<boolean> {
    let settled = false;
    const markSettled = (): void => {
      settled = true;
    };
    work.then(markSettled, markSettled);

    const idleSince = performance.now();
    for (;;) {
      await nextTurn();
      if (settled) {
        return false;
      }
      if (vi.getTimerCount() > 0) {
        return true;
      }
      if (performance.now() - idleSince >= FakeTimers.MAX_IDLE_MS) {
        throw new Error(
          `Relay had no timer pending for ${FakeTimers.MAX_IDLE_MS} ms; it looks hung waiting on I/O.`,
        );
      }
    }
  }
}
