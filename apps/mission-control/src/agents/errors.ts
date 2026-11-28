/** Fastify answers with `statusCode` and `code`. */
export class AgentMismatchError extends Error {
  override name = 'AgentMismatchError';
  readonly statusCode = 403;
  readonly code = 'AGENT_MISMATCH';

  constructor(props: { own: string; named: string }) {
    super(
      `This key belongs to agent “${props.own}” and can't report as “${props.named}”.`,
    );
  }
}

/** Fastify answers with `statusCode` and `code`. */
export class AgentSessionsSignInRequiredError extends Error {
  override name = 'AgentSessionsSignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to see agent sessions.');
  }
}

/** Fastify answers with `statusCode` and `code`. */
export class NeedsYouSignInRequiredError extends Error {
  override name = 'NeedsYouSignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to see what needs you.');
  }
}

/** The insert neither stored the heartbeat nor found the one already stored under its `(sessionId, seq)`. */
export class AgentHeartbeatNotRecordedError extends Error {
  override name = 'AgentHeartbeatNotRecordedError';

  constructor(props: { sessionId: string; seq: number }) {
    super(
      `agent_heartbeat holds no row for session ${props.sessionId} seq ${props.seq}`,
    );
  }
}

export class AgentHeartbeatRetentionNotRegisteredError extends Error {
  override name = 'AgentHeartbeatRetentionNotRegisteredError';

  constructor() {
    super('Register the heartbeat retention workflow before activating it');
  }
}

export class AgentSessionWatchdogNotRegisteredError extends Error {
  override name = 'AgentSessionWatchdogNotRegisteredError';

  constructor() {
    super('Register the agent session watchdog workflow before activating it');
  }
}
