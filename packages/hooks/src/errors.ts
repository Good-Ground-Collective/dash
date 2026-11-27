/** The hook was run with a subcommand that names no Claude Code hook event. */
export class UnknownHookEventError extends Error {
  override name = 'UnknownHookEventError';

  constructor(props: { command: string }) {
    super(`'${props.command}' is not a hook event dash-hooks handles`);
  }
}

/** Another hook process held the session's lock for longer than a heartbeat may wait. */
export class SessionLockTimeoutError extends Error {
  override name = 'SessionLockTimeoutError';

  constructor(props: { lockPath: string; waitedMs: number }) {
    super(
      `Gave up on the session lock ${props.lockPath} after ${props.waitedMs} ms`,
    );
  }
}

/** A heartbeat stayed over the outbox line limit even after every trimming step. */
export class HeartbeatTooLargeError extends Error {
  override name = 'HeartbeatTooLargeError';

  constructor(props: { bytes: number; limit: number }) {
    super(
      `The heartbeat is ${props.bytes} bytes after trimming; outbox lines must stay under ${props.limit}`,
    );
  }
}
