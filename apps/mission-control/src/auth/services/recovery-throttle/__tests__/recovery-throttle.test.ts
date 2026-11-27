import { describe, expect, it } from 'vitest';

import { RecoveryRateLimitedError } from '#src/auth/errors.ts';
import { WindowRecoveryThrottle } from '#src/auth/services/recovery-throttle/recovery-throttle.ts';

/** A hand-moved clock, and a throttle of two per email and three overall every minute on it. */
class Clock {
  milliseconds = 0;
  readonly now = (): number => this.milliseconds;

  throttle(): WindowRecoveryThrottle {
    return new WindowRecoveryThrottle({
      windowSeconds: 60,
      perEmail: 2,
      overall: 3,
      now: this.now,
    });
  }
}

describe('WindowRecoveryThrottle', () => {
  it('allows attempts up to the per-email limit, then refuses with the seconds left', () => {
    const clock = new Clock();
    const limiter = clock.throttle();
    limiter.attempt({ email: 'ada@example.com' });
    limiter.attempt({ email: 'ADA@example.com ' });
    clock.milliseconds = 20_000;

    expect(() => {
      limiter.attempt({ email: 'ada@example.com' });
    }).toThrow(
      expect.objectContaining({
        name: 'RecoveryRateLimitedError',
        headers: expect.objectContaining({ 'retry-after': '40' }),
      }),
    );
  });

  it('caps attempts across every email', () => {
    const limiter = new Clock().throttle();
    limiter.attempt({ email: 'a@example.com' });
    limiter.attempt({ email: 'b@example.com' });
    limiter.attempt({ email: 'c@example.com' });

    expect(() => {
      limiter.attempt({ email: 'd@example.com' });
    }).toThrow(RecoveryRateLimitedError);
  });

  it('opens again once the window has passed', () => {
    const clock = new Clock();
    const limiter = clock.throttle();
    limiter.attempt({ email: 'ada@example.com' });
    limiter.attempt({ email: 'ada@example.com' });
    clock.milliseconds = 60_000;

    expect(() => {
      limiter.attempt({ email: 'ada@example.com' });
    }).not.toThrow();
  });

  it('does not count a refused attempt', () => {
    const clock = new Clock();
    const limiter = clock.throttle();
    limiter.attempt({ email: 'ada@example.com' });
    limiter.attempt({ email: 'ada@example.com' });
    expect(() => {
      limiter.attempt({ email: 'ada@example.com' });
    }).toThrow(RecoveryRateLimitedError);

    expect(() => {
      limiter.attempt({ email: 'grace@example.com' });
    }).not.toThrow();
  });
});
