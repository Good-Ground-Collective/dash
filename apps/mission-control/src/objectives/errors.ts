/** An owned connection without an installation, or without the person who made it, can't be read with the app. */
export class ObjectiveConnectionUnreadableError extends Error {
  override name = 'ObjectiveConnectionUnreadableError';

  constructor(props: { connectionId: string }) {
    super(
      `Connection ${props.connectionId} has no installation or connecting person to read for`,
    );
  }
}

export class ObjectiveInstallationSuspendedError extends Error {
  override name = 'ObjectiveInstallationSuspendedError';

  constructor() {
    super('The app installation is suspended, so Dash can’t read its tracker.');
  }
}

/** Fastify answers with `statusCode` and `code`. */
export class ObjectivesSignInRequiredError extends Error {
  override name = 'ObjectivesSignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to read your objectives.');
  }
}

/** The id names no initiative or epic in the signed-in person's connections. */
export class ObjectiveNotFoundError extends Error {
  override name = 'ObjectiveNotFoundError';
  readonly statusCode = 404;
  readonly code = 'OBJECTIVE_NOT_FOUND';

  constructor(props: { id: string }) {
    super(`No initiative or epic ${props.id} in your connections`);
  }
}

/** Dash keeps a priority, due date or manual progress only while the tracker has none of its own. */
export class TrackerOwnsFieldError extends Error {
  override name = 'TrackerOwnsFieldError';
  readonly statusCode = 409;
  readonly code = 'TRACKER_OWNS_FIELD';

  constructor(props: { field: string }) {
    super(
      `The tracker already sets ${props.field}. Change it there instead of in Dash.`,
    );
  }
}

export class ObjectiveReconcileNotRegisteredError extends Error {
  override name = 'ObjectiveReconcileNotRegisteredError';

  constructor() {
    super('Register the objective reconcile workflows before using them');
  }
}

export class OverlayNotSavedError extends Error {
  override name = 'OverlayNotSavedError';

  constructor() {
    super('Postgres returned no overlay row from the upsert');
  }
}
