import { z } from 'zod';

import { SetupRateLimitedError } from '#src/auth/errors.ts';

export const setupThrottleSettingsSchema = z.object({
  windowSeconds: z.number().int().positive(),
  max: z
    .number()
    .int()
    .positive()
    .describe('Token attempts allowed in a window, across every caller.'),
  now: z
    .custom<() => number>((value) => value instanceof Function)
    .default(() => () => Date.now()),
});

export type SetupThrottleSettings = z.input<typeof setupThrottleSettingsSchema>;

/** Ten token attempts a minute, shared by check and begin. */
export const defaultSetupThrottleSettings: SetupThrottleSettings = {
  windowSeconds: 60,
  max: 10,
};

export interface SetupThrottle {
  /** Counts one token attempt, rejecting with `SetupRateLimitedError` once the window is full. */
  attempt(): void;
}

/**
 * One fixed window for the whole process, not keyed by client address. Setup is a one-time,
 * single-person flow, so a shared budget costs nothing, and neither a spoofed forwarding header
 * nor a missing address can get around it.
 */
export class WindowSetupThrottle implements SetupThrottle {
  private readonly windowMilliseconds: number;
  private readonly max: number;
  private readonly now: () => number;
  private startedAt = Number.NEGATIVE_INFINITY;
  private count = 0;

  constructor(props: SetupThrottleSettings = defaultSetupThrottleSettings) {
    const settings = setupThrottleSettingsSchema.parse(props);
    this.windowMilliseconds = settings.windowSeconds * 1000;
    this.max = settings.max;
    this.now = settings.now;
  }

  attempt(): void {
    const now = this.now();
    if (now - this.startedAt >= this.windowMilliseconds) {
      this.startedAt = now;
      this.count = 0;
    }
    if (this.count >= this.max) {
      throw new SetupRateLimitedError({
        retryAfterSeconds: Math.ceil(
          (this.startedAt + this.windowMilliseconds - now) / 1000,
        ),
      });
    }
    this.count += 1;
  }
}
