import { z } from 'zod';

import { RecoveryRateLimitedError } from '#src/auth/errors.ts';

export const recoveryThrottleSettingsSchema = z.object({
  windowSeconds: z.number().int().positive(),
  perEmail: z
    .number()
    .int()
    .positive()
    .describe('Attempts allowed for one email in a window.'),
  overall: z
    .number()
    .int()
    .positive()
    .describe('Attempts allowed across every email in a window.'),
});

export type RecoveryThrottleSettings = z.input<
  typeof recoveryThrottleSettingsSchema
>;

/** Five tries per email and a hundred overall every fifteen minutes: about 9,600 guesses a day at most, against roughly 8.5e11 possible codes. */
export const defaultRecoveryThrottleSettings: RecoveryThrottleSettings = {
  windowSeconds: 15 * 60,
  perEmail: 5,
  overall: 100,
};

/** Said once per window when a limit first refuses an attempt. They never name the email. */
const tripWarnings = {
  email:
    'Recovery codes: one email reached its attempt limit, so redeeming for it is refused until its window passes.',
  overall:
    'Recovery codes: the overall attempt limit is reached, so redeeming is refused for everyone until the window passes. `dash admin recover` still works.',
} as const;

interface Window {
  startedAt: number;
  count: number;
  /** Set once the window has refused an attempt, so it warns once. */
  tripped: boolean;
}

/**
 * Fixed windows in memory, keyed by email and overall rather than by IP, so neither a spoofed
 * forwarding header nor a botnet helps. Every attempt counts, for emails that exist and emails
 * that don't alike, so a 429 reveals nothing either. The overall window is shared: a flood of
 * attempts against any emails suspends code recovery for everyone until it passes, and the
 * break-glass command is the way in meanwhile. `warn` hears about the first refusal in each
 * window, without the email. Mission Control runs as one process, and a restart resetting the
 * count is fine: an attacker can't cause one.
 */
export class WindowRecoveryThrottle {
  private readonly settings: z.infer<typeof recoveryThrottleSettingsSchema>;
  private readonly windows = new Map<string, Window>();

  constructor(props: RecoveryThrottleSettings) {
    this.settings = recoveryThrottleSettingsSchema.parse(props);
  }

  /** Counts one attempt for `email`, rejecting with `RecoveryRateLimitedError` once its window or the overall window is full. */
  attempt(props: {
    email: string;
    /** Hears one warning per window and limit, for the operator's log. */
    warn: (message: string) => void;
  }): void {
    const now = Date.now();
    this.prune(now);
    const limits = [
      {
        limit: 'email' as const,
        key: `email:${props.email.trim().toLowerCase()}`,
        max: this.settings.perEmail,
      },
      { limit: 'overall' as const, key: 'overall', max: this.settings.overall },
    ];

    for (const { limit, key, max } of limits) {
      const window = this.windows.get(key);
      if (window !== undefined && window.count >= max) {
        if (!window.tripped) {
          window.tripped = true;
          props.warn(tripWarnings[limit]);
        }
        throw new RecoveryRateLimitedError({
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (window.startedAt + this.windowMilliseconds() - now) / 1000,
            ),
          ),
        });
      }
    }

    for (const { key } of limits) {
      const window = this.windows.get(key);
      if (window === undefined) {
        this.windows.set(key, { startedAt: now, count: 1, tripped: false });
      } else {
        window.count += 1;
      }
    }
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMilliseconds()) {
        this.windows.delete(key);
      }
    }
  }

  private windowMilliseconds(): number {
    return this.settings.windowSeconds * 1000;
  }
}
