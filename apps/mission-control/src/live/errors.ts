/** Fastify answers with `statusCode` and `code`. */
export class LiveEventsSignInRequiredError extends Error {
  override name = 'LiveEventsSignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to follow live updates.');
  }
}
