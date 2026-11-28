/** The person who made a connection hasn't linked their GitHub account, so Dash can't tell whose work to read. */
export class ViewerNotLinkedError extends Error {
  override name = 'ViewerNotLinkedError';

  constructor() {
    super(
      'Authorize the GitHub app in Dash so it knows which GitHub account is yours.',
    );
  }
}

/** An owned connection without an installation can't be read with the App. */
export class ConnectionNotReadableError extends Error {
  override name = 'ConnectionNotReadableError';

  constructor(props: { connectionId: string }) {
    super(`Connection ${props.connectionId} has no installation to read`);
  }
}

export class ConnectorUnknownError extends Error {
  override name = 'ConnectorUnknownError';

  constructor(props: { connectionId: string }) {
    super(
      `Connection ${props.connectionId} has no connecting person to read for`,
    );
  }
}

export class InstallationSuspendedError extends Error {
  override name = 'InstallationSuspendedError';

  constructor() {
    super('The GitHub App installation is suspended, so Dash can’t read it.');
  }
}

/** Fastify answers with `statusCode` and `code`. */
export class FeedSignInRequiredError extends Error {
  override name = 'FeedSignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to read your GitHub feed.');
  }
}

/** Fastify answers with `statusCode` and `code`. */
export class WatchedChecksSignInRequiredError extends Error {
  override name = 'WatchedChecksSignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to choose which checks you watch.');
  }
}

/** The id names no rule of the signed-in person. */
export class WatchRuleNotFoundError extends Error {
  override name = 'WatchRuleNotFoundError';
  readonly statusCode = 404;
  readonly code = 'WATCH_RULE_NOT_FOUND';

  constructor(props: { id: string }) {
    super(`You have no watch rule ${props.id}`);
  }
}

export class ReconcileNotRegisteredError extends Error {
  override name = 'ReconcileNotRegisteredError';

  constructor() {
    super('Register the GitHub reconcile workflows before using them');
  }
}

/** A connection read's follow-up is keyed by the read's workflow id, so the read must run as a workflow. */
export class ReconcileOutsideWorkflowError extends Error {
  override name = 'ReconcileOutsideWorkflowError';

  constructor() {
    super('A connection read ran outside a DBOS workflow');
  }
}
