import { setImmediate as nextTurn } from 'node:timers/promises';

import type { RelayClock } from '#src/services/relay-clock/relay-clock.js';

/** Thrown from a relay's sleep once the test has stopped its clock, so the relay exits. */
export class ManualRelayClockStoppedError extends Error {
  override name = 'ManualRelayClockStoppedError';

  constructor() {
    super('the test stopped the relay clock');
  }
}

type Hold = { at: number; reached: () => void; release: () => void };

/**
 * A relay clock the test drives. Each sleep moves time forward at once instead of waiting, so polls,
 * the idle exit and backoff take no real time; a test can also hold the relay at a chosen sleep.
 */
export class ManualRelayClock implements RelayClock {
  readonly sleeps: number[] = [];
  private nowMs = 0;
  private stopped = false;
  private hold: (Hold & { released: Promise<void> }) | undefined;

  now(): number {
    return this.nowMs;
  }

  async sleep(ms: number): Promise<void> {
    this.throwIfStopped();
    this.sleeps.push(ms);
    this.nowMs += ms;

    const hold = this.hold;
    if (hold?.at === this.sleeps.length) {
      hold.reached();
      await hold.released;
    }
    await nextTurn();
    this.throwIfStopped();
  }

  /** Resolves once the relay reaches its `count`th sleep, which lasts until the returned function is called. */
  holdAt(count: number): Promise<() => void> {
    return new Promise((resolve) => {
      let release = (): void => undefined;
      const released = new Promise<void>((done) => {
        release = done;
      });
      this.hold = {
        at: count,
        released,
        release,
        reached: () => resolve(release),
      };
    });
  }

  /** Makes every sleep throw, releasing a held one, so a relay still running ends. */
  stop(): void {
    this.stopped = true;
    this.hold?.release();
  }

  private throwIfStopped(): void {
    if (this.stopped) {
      throw new ManualRelayClockStoppedError();
    }
  }
}
