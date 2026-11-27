/** An installation can only be recorded for someone who has authorized the app, so Dash can check it is theirs. */
export class AccountNotLinkedError extends Error {
  override name = 'AccountNotLinkedError';

  constructor(props: { provider: string }) {
    super(
      `Authorize the ${props.provider} app before recording an installation`,
    );
  }
}

export class InstallationNotYoursError extends Error {
  override name = 'InstallationNotYoursError';

  constructor(props: { installationId: string }) {
    super(
      `Installation ${props.installationId} is not one your linked account can manage`,
    );
  }
}

export class AccountLinkedElsewhereError extends Error {
  override name = 'AccountLinkedElsewhereError';

  constructor(props: { login: string }) {
    super(`${props.login} is already linked to another Dash principal`);
  }
}

/** A sealed token didn't open: it was altered, sealed for another row, or sealed under another secret. */
export class SealedTokenError extends Error {
  override name = 'SealedTokenError';

  constructor(props: { cause: unknown }) {
    super('A stored token could not be decrypted', { cause: props.cause });
  }
}

/** Fastify answers with `statusCode` and `code`. */
export class SignInRequiredError extends Error {
  override name = 'SignInRequiredError';
  readonly statusCode = 401;
  readonly code = 'SIGN_IN_REQUIRED';

  constructor() {
    super('Sign in to Dash as a person to connect an account.');
  }
}

export class WebhookSignatureRejectedError extends Error {
  override name = 'WebhookSignatureRejectedError';
  readonly statusCode = 401;
  readonly code = 'WEBHOOK_SIGNATURE_REJECTED';

  constructor() {
    super('The delivery signature does not match the webhook secret.');
  }
}

export class ConnectionNotStoredError extends Error {
  override name = 'ConnectionNotStoredError';

  constructor() {
    super('Upsert into connection returned no row');
  }
}

export class WebhookWorkflowsNotRegisteredError extends Error {
  override name = 'WebhookWorkflowsNotRegisteredError';

  constructor() {
    super('Register the webhook workflows before using them');
  }
}
