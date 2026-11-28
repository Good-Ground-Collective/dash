/** Fastify answers with `statusCode` and `code`. */
export class BriefingSignInRequiredError extends Error {
  override name = 'BriefingSignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to read your briefings.');
  }
}

export class BriefingNotSavedError extends Error {
  override name = 'BriefingNotSavedError';

  constructor() {
    super('Postgres returned no briefing row from the insert');
  }
}

export class BriefingNotRegisteredError extends Error {
  override name = 'BriefingNotRegisteredError';

  constructor() {
    super('Register the briefing retention workflow before activating it');
  }
}
