/** Fastify answers with `statusCode` and `code`. */
export class SignInRequiredError extends Error {
  override name = 'SignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to see what is left to set up.');
  }
}
