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

/** Five tries per email and twenty overall every fifteen minutes. */
export const defaultRecoveryThrottleSettings: RecoveryThrottleSettings = {
  windowSeconds: 15 * 60,
  perEmail: 5,
  overall: 20,
};

export interface RecoveryThrottle {
  /** Counts one attempt for `email`, rejecting with `RecoveryRateLimitedError` once its window or the overall window is full. */
  attempt(props: { email: string }): void;
}

interface Window {
  startedAt: number;
  count: number;
}

/**
 * Fixed windows in memory, keyed by email and overall rather than by IP, so neither a spoofed
 * forwarding header nor a botnet helps. Every attempt counts, for emails that exist and emails
 * that don't alike, so a 429 reveals nothing either. Mission Control runs as one process, and a
 * restart resetting the count is fine: an attacker can't cause one.
 */
export class WindowRecoveryThrottle implements RecoveryThrottle {
  private readonly settings: z.infer<typeof recoveryThrottleSettingsSchema>;
  private readonly windows = new Map<string, Window>();
  private readonly now: () => number;

  constructor(
    props: RecoveryThrottleSettings & {
      /** The clock, in milliseconds. Tests pass their own. */
      now?: () => number;
    },
  ) {
    this.settings = recoveryThrottleSettingsSchema.parse(props);
    this.now = props.now ?? Date.now;
  }

  attempt(props: { email: string }): void {
    const now = this.now();
    this.prune(now);
    const keys: [string, number][] = [
      [`email:${props.email.trim().toLowerCase()}`, this.settings.perEmail],
      ['overall', this.settings.overall],
    ];

    for (const [key, max] of keys) {
      const window = this.windows.get(key);
      if (window !== undefined && window.count >= max) {
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

    for (const [key] of keys) {
      const window = this.windows.get(key);
      if (window === undefined) {
        this.windows.set(key, { startedAt: now, count: 1 });
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
