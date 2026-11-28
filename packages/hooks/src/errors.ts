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

/** Retention could not delete some expired outbox or session files; the rest were still pruned. */
export class OutboxRetentionError extends Error {
  override name = 'OutboxRetentionError';

  constructor(props: { failures: { file: string; cause: unknown }[] }) {
    super(
      `Could not delete ${props.failures.length} expired file(s): ${props.failures
        .map(
          ({ file, cause }) =>
            `${file} (${cause instanceof Error ? cause.message : String(cause)})`,
        )
        .join('; ')}`,
    );
  }
}

/** The relay's configuration file can be read by other users, so the key in it is not used. */
export class RelayConfigExposedError extends Error {
  override name = 'RelayConfigExposedError';

  constructor(props: { configPath: string; mode: number }) {
    super(
      `${props.configPath} holds an API key but has mode ${(props.mode & 0o777).toString(8)}; run chmod 600 on it`,
    );
  }
}

/** `dash-hooks relay` ran with no configuration file and no `DASH_API_*` variables. */
export class RelayNotConfiguredError extends Error {
  override name = 'RelayNotConfiguredError';

  constructor(props: { configPath: string }) {
    super(
      `The relay has nowhere to send heartbeats: create ${props.configPath} with apiUrl, apiKey and reporterName`,
    );
  }
}

/** The relay's configuration is missing a setting or has one that doesn't parse. Names the fields, never their values. */
export class RelayConfigInvalidError extends Error {
  override name = 'RelayConfigInvalidError';

  constructor(props: { configPath: string; fields: string[] }) {
    super(
      `The relay configuration (${props.configPath} and DASH_* variables) has missing or invalid fields: ${props.fields.join(', ')}`,
    );
  }
}

/** Mission Control refused the relay's API key. Retrying can't help until the key, URL or reporter name changes. */
export class MissionControlRefusedKeyError extends Error {
  override name = 'MissionControlRefusedKeyError';
  readonly status: number;

  constructor(props: { status: number }) {
    super(
      `Mission Control answered ${props.status} to the relay's API key; the relay stopped and starts again once the key, URL or reporter name changes`,
    );
    this.status = props.status;
  }
}

/** Mission Control couldn't take a batch right now: unreachable, failing, or answering something unexpected. The relay retries. */
export class MissionControlUnavailableError extends Error {
  override name = 'MissionControlUnavailableError';

  constructor(props: { detail: string; cause?: unknown }) {
    super(`Mission Control could not take heartbeats: ${props.detail}`, {
      cause: props.cause,
    });
  }
}

/** Mission Control answered `invalid` for one heartbeat. The relay skips past it so it can't hold up the rest. */
export class HeartbeatRejectedError extends Error {
  override name = 'HeartbeatRejectedError';

  constructor(props: {
    outboxPath: string;
    seq: number | undefined;
    issues: { path: string; message: string }[];
  }) {
    super(
      `Mission Control rejected seq ${props.seq ?? '?'} from ${props.outboxPath}: ${props.issues
        .map(({ path, message }) => `${path || '(root)'} ${message}`)
        .join('; ')}`,
    );
  }
}

/** An outbox line that isn't JSON. The relay skips it rather than sending it. */
export class UnreadableOutboxLineError extends Error {
  override name = 'UnreadableOutboxLineError';

  constructor(props: { outboxPath: string; offset: number }) {
    super(
      `Skipped a line of ${props.outboxPath} at byte ${props.offset} that is not JSON`,
    );
  }
}
