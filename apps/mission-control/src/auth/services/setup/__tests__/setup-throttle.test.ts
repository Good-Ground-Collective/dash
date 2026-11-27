import { describe, expect, it } from 'vitest';

import { SetupRateLimitedError } from '#src/auth/errors.ts';
import { WindowSetupThrottle } from '#src/auth/services/setup/setup-throttle.ts';

/** A hand-moved clock, and a throttle of two attempts a minute on it. */
class Clock {
  milliseconds = 0;
  readonly now = (): number => this.milliseconds;

  throttle(): WindowSetupThrottle {
    return new WindowSetupThrottle({
      windowSeconds: 60,
      max: 2,
      now: this.now,
    });
  }
}

describe('WindowSetupThrottle', () => {
  it('allows attempts up to the limit, then refuses with the seconds left', () => {
    const clock = new Clock();
    const throttle = clock.throttle();
    throttle.attempt();
    throttle.attempt();
    clock.milliseconds = 20_000;

    expect(() => {
      throttle.attempt();
    }).toThrow(
      expect.objectContaining({
        name: 'SetupRateLimitedError',
        headers: expect.objectContaining({ 'retry-after': '40' }),
      }),
    );
  });

  it('opens again once the window has passed', () => {
    const clock = new Clock();
    const throttle = clock.throttle();
    throttle.attempt();
    throttle.attempt();
    expect(() => {
      throttle.attempt();
    }).toThrow(SetupRateLimitedError);
    clock.milliseconds = 60_000;

    expect(() => {
      throttle.attempt();
    }).not.toThrow();
  });
});
