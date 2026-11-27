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

export class ReconcileNotRegisteredError extends Error {
  override name = 'ReconcileNotRegisteredError';

  constructor() {
    super('Register the GitHub reconcile workflows before using them');
  }
}
