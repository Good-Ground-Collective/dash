import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RecoveryRateLimitedError } from '#src/auth/errors.ts';
import { WindowRecoveryThrottle } from '#src/auth/services/recovery-throttle/recovery-throttle.ts';

/** Two attempts per email and three overall every minute, recording which limits tripped. */
class Throttled {
  readonly trips: string[] = [];
  readonly throttle = new WindowRecoveryThrottle({
    windowSeconds: 60,
    perEmail: 2,
    overall: 3,
  });

  attempt(email: string): void {
    this.throttle.attempt({
      email,
      warn: (message) =>
        this.trips.push(message.includes('overall') ? 'overall' : 'email'),
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WindowRecoveryThrottle limits', () => {
  it('allows attempts up to the per-email limit, then refuses with the seconds left', () => {
    const throttled = new Throttled();
    throttled.attempt('ada@example.com');
    throttled.attempt('ADA@example.com ');
    vi.advanceTimersByTime(20_000);

    expect(() => {
      throttled.attempt('ada@example.com');
    }).toThrow(
      expect.objectContaining({
        name: 'RecoveryRateLimitedError',
        headers: expect.objectContaining({ 'retry-after': '40' }),
      }),
    );
  });

  it('caps attempts across every email', () => {
    const throttled = new Throttled();
    throttled.attempt('a@example.com');
    throttled.attempt('b@example.com');
    throttled.attempt('c@example.com');

    expect(() => {
      throttled.attempt('d@example.com');
    }).toThrow(RecoveryRateLimitedError);
  });

  it('opens again once the window has passed', () => {
    const throttled = new Throttled();
    throttled.attempt('ada@example.com');
    throttled.attempt('ada@example.com');
    vi.advanceTimersByTime(60_000);

    expect(() => {
      throttled.attempt('ada@example.com');
    }).not.toThrow();
  });

  it('does not count a refused attempt', () => {
    const throttled = new Throttled();
    throttled.attempt('ada@example.com');
    throttled.attempt('ada@example.com');
    expect(() => {
      throttled.attempt('ada@example.com');
    }).toThrow(RecoveryRateLimitedError);

    expect(() => {
      throttled.attempt('grace@example.com');
    }).not.toThrow();
  });
});

describe('WindowRecoveryThrottle trips', () => {
  it('reports each limit once per window, without the email', () => {
    const throttled = new Throttled();
    throttled.attempt('ada@example.com');
    throttled.attempt('ada@example.com');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => {
        throttled.attempt('ada@example.com');
      }).toThrow(RecoveryRateLimitedError);
    }
    throttled.attempt('grace@example.com');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(() => {
        throttled.attempt('alan@example.com');
      }).toThrow(RecoveryRateLimitedError);
    }

    expect(throttled.trips).toEqual(['email', 'overall']);
  });

  it('reports again in the next window', () => {
    const throttled = new Throttled();
    throttled.attempt('ada@example.com');
    throttled.attempt('ada@example.com');
    expect(() => {
      throttled.attempt('ada@example.com');
    }).toThrow(RecoveryRateLimitedError);
    vi.advanceTimersByTime(60_000);
    throttled.attempt('ada@example.com');
    throttled.attempt('ada@example.com');
    expect(() => {
      throttled.attempt('ada@example.com');
    }).toThrow(RecoveryRateLimitedError);

    expect(throttled.trips).toEqual(['email', 'email']);
  });
});
