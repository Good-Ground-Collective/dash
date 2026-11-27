import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SetupRateLimitedError } from '#src/auth/errors.ts';
import { SetupThrottle } from '#src/auth/services/setup/setup-throttle.ts';

/** A throttle with its first minute spent, and the warnings it logged. */
class SpentThrottle {
  readonly warnings: string[] = [];
  readonly logger = {
    warn: (message: string): void => {
      this.warnings.push(message);
    },
  };
  readonly throttle = new SetupThrottle();

  constructor() {
    for (let attempts = 0; attempts < 60; attempts += 1) {
      this.throttle.attempt({ logger: this.logger });
    }
  }

  attempt(): void {
    this.throttle.attempt({ logger: this.logger });
  }
}

describe('SetupThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows sixty attempts a minute, then refuses with the seconds left', () => {
    const spent = new SpentThrottle();
    vi.setSystemTime(20_000);

    expect(() => {
      spent.attempt();
    }).toThrow(
      expect.objectContaining({
        name: 'SetupRateLimitedError',
        headers: expect.objectContaining({ 'retry-after': '40' }),
      }),
    );
  });

  it('warns once per window when it trips, naming no token or address', () => {
    const spent = new SpentThrottle();

    expect(() => {
      spent.attempt();
    }).toThrow(SetupRateLimitedError);
    expect(() => {
      spent.attempt();
    }).toThrow(SetupRateLimitedError);

    expect(spent.warnings).toEqual([
      'Setup token attempts hit 60 a minute; refusing until the window resets.',
    ]);
  });

  it('opens again once the window has passed', () => {
    const spent = new SpentThrottle();
    vi.setSystemTime(60_000);

    expect(() => {
      spent.attempt();
    }).not.toThrow();
  });
});
