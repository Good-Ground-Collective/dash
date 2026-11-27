import { SetupRateLimitedError } from '#src/auth/errors.ts';

const windowMilliseconds = 60 * 1000;
/** Token attempts allowed a minute, across every caller. */
const maxAttempts = 60;

/**
 * One fixed window for the whole process, not keyed by client address. Setup is a one-time,
 * single-person bootstrap and the token is 40 random characters, so the budget only bounds load;
 * the client address isn't trusted behind the proxy, so neither a spoofed forwarding header nor a
 * missing address can get around it. The first refusal in a window logs a warning, without the
 * token or the caller's address, so the operator can see someone holding setup up.
 */
export class SetupThrottle {
  private startedAt = Number.NEGATIVE_INFINITY;
  private count = 0;
  private warned = false;

  /** Counts one token attempt, rejecting with `SetupRateLimitedError` once the window is full. */
  attempt(props: { logger: { warn: (message: string) => void } }): void {
    const now = Date.now();
    if (now - this.startedAt >= windowMilliseconds) {
      this.startedAt = now;
      this.count = 0;
      this.warned = false;
    }
    if (this.count >= maxAttempts) {
      if (!this.warned) {
        props.logger.warn(
          `Setup token attempts hit ${maxAttempts} a minute; refusing until the window resets.`,
        );
        this.warned = true;
      }
      throw new SetupRateLimitedError({
        retryAfterSeconds: Math.ceil(
          (this.startedAt + windowMilliseconds - now) / 1000,
        ),
      });
    }
    this.count += 1;
  }
}
