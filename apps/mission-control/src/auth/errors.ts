import { APIError } from 'better-auth/api';

/** Raised inside Better Auth, so it answers 403 rather than 500. */
export class ServicePrincipalForbiddenError extends APIError {
  override name = 'ServicePrincipalForbiddenError';

  constructor(props: { action: string }) {
    super('FORBIDDEN', {
      code: 'SERVICE_PRINCIPAL_FORBIDDEN',
      message: `Only a person can ${props.action}. Service principals authenticate with API keys.`,
    });
  }
}

export class ServicePrincipalOwnerError extends Error {
  override name = 'ServicePrincipalOwnerError';

  constructor(props: { ownerUserId: string }) {
    super(
      `Principal ${props.ownerUserId} can't own a service principal: it doesn't exist or isn't a person`,
    );
  }
}

export class ServicePrincipalNotStoredError extends Error {
  override name = 'ServicePrincipalNotStoredError';

  constructor() {
    super('Insert into user or service_profile returned no row');
  }
}

export class SetupClosedError extends APIError {
  override name = 'SetupClosedError';

  constructor() {
    super('FORBIDDEN', {
      code: 'SETUP_CLOSED',
      message:
        'Setup is closed: someone has already signed up. Ask them to add you.',
    });
  }
}

export class SetupTokenRejectedError extends APIError {
  override name = 'SetupTokenRejectedError';

  constructor() {
    super('UNAUTHORIZED', {
      code: 'SETUP_TOKEN_REJECTED',
      message:
        'That setup token is not the current one. Use the latest token Mission Control logged at boot.',
    });
  }
}

export class PasskeyEnrolmentRejectedError extends APIError {
  override name = 'PasskeyEnrolmentRejectedError';

  constructor(props: { reason: string }) {
    super('UNAUTHORIZED', {
      code: 'PASSKEY_ENROLMENT_REJECTED',
      message: `Can't enrol this passkey: ${props.reason}`,
    });
  }
}

export class LastPasskeyError extends APIError {
  override name = 'LastPasskeyError';

  constructor() {
    super('CONFLICT', {
      code: 'LAST_PASSKEY',
      message:
        "This is your only passkey. Add another before removing it, or you can't sign in.",
    });
  }
}

export class SessionNotFreshError extends APIError {
  override name = 'SessionNotFreshError';

  constructor(props: { freshMinutes: number }) {
    super('FORBIDDEN', {
      code: 'SESSION_NOT_FRESH',
      message: `Sign in with a passkey again: this change needs a sign-in from the last ${props.freshMinutes} minutes.`,
    });
  }
}

/** The same answer for an unknown email, a wrong code and a used one, so it never says whether an account exists. */
export class RecoveryRejectedError extends APIError {
  override name = 'RecoveryRejectedError';

  constructor() {
    super('UNAUTHORIZED', {
      code: 'RECOVERY_REJECTED',
      message:
        "That email and recovery code don't match an unused code. Check both, or use another code.",
    });
  }
}

export class RecoveryRateLimitedError extends APIError {
  override name = 'RecoveryRateLimitedError';

  constructor(props: { retryAfterSeconds: number }) {
    super(
      'TOO_MANY_REQUESTS',
      {
        code: 'RECOVERY_RATE_LIMITED',
        message: `Too many recovery attempts. Try again in ${Math.ceil(props.retryAfterSeconds / 60)} minutes.`,
      },
      { 'retry-after': String(props.retryAfterSeconds) },
    );
  }
}

export class RecoveryCodeSetNotPendingError extends APIError {
  override name = 'RecoveryCodeSetNotPendingError';

  constructor() {
    super('CONFLICT', {
      code: 'RECOVERY_CODE_SET_NOT_PENDING',
      message:
        'Those codes are no longer waiting to be confirmed. Generate a new set.',
    });
  }
}

/** For the break-glass command, which runs on the host and may say who exists. */
export class RecoveryPersonNotFoundError extends Error {
  override name = 'RecoveryPersonNotFoundError';

  constructor(props: { email: string }) {
    super(`Nobody who signs in with a passkey has the email ${props.email}.`);
  }
}

export class ServiceAccountNotFoundError extends APIError {
  override name = 'ServiceAccountNotFoundError';

  constructor() {
    super('NOT_FOUND', {
      code: 'SERVICE_ACCOUNT_NOT_FOUND',
      message: 'You have no service account with that id.',
    });
  }
}

export class ServiceAccountTakenError extends APIError {
  override name = 'ServiceAccountTakenError';

  constructor(props: { identifier: string }) {
    super('CONFLICT', {
      code: 'SERVICE_ACCOUNT_TAKEN',
      message: `A service account for “${props.identifier}” already exists. Issue it a new key instead.`,
    });
  }
}

export class ApiKeyNotFoundError extends APIError {
  override name = 'ApiKeyNotFoundError';

  constructor() {
    super('NOT_FOUND', {
      code: 'API_KEY_NOT_FOUND',
      message: 'None of your service accounts has a key with that id.',
    });
  }
}

/** The api-key plugin's own endpoints would let a person mint keys for themselves, so Dash answers them as if they didn't exist. */
export class ApiKeyEndpointClosedError extends APIError {
  override name = 'ApiKeyEndpointClosedError';

  constructor() {
    super('NOT_FOUND', {
      code: 'NOT_FOUND',
      message: 'Manage keys under /service-accounts.',
    });
  }
}

export class ApiKeyNotIssuedError extends Error {
  override name = 'ApiKeyNotIssuedError';

  constructor() {
    super('The api-key plugin returned no key');
  }
}

/** Issuing an account's first key failed, and so did removing the account again. `cause` is the issuance failure; `cleanup` is why the keyless account is still there. */
export class ServiceAccountNotCreatedError extends Error {
  override name = 'ServiceAccountNotCreatedError';
  readonly cleanup: unknown;

  constructor(props: { cause: unknown; cleanup: unknown }) {
    super('The first key was not issued and the account could not be removed', {
      cause: props.cause,
    });
    this.cleanup = props.cleanup;
  }
}

/** Fastify answers with `statusCode` and `code`. */
export class ApiKeyMissingError extends Error {
  override name = 'ApiKeyMissingError';
  readonly statusCode = 401;
  readonly code = 'API_KEY_MISSING';

  constructor() {
    super(
      'Send a service account key as `Authorization: Bearer dash_…` or `x-api-key`.',
    );
  }
}

export class ApiKeyRejectedError extends Error {
  override name = 'ApiKeyRejectedError';
  readonly statusCode = 401;
  readonly code = 'API_KEY_REJECTED';

  constructor() {
    super('That API key is unknown, revoked or expired.');
  }
}

export class ApiKeyScopeError extends Error {
  override name = 'ApiKeyScopeError';
  readonly statusCode = 403;
  readonly code = 'API_KEY_SCOPE_MISSING';

  constructor(props: { scope: string }) {
    super(`This key lacks the \`${props.scope}\` scope.`);
  }
}

export class AgentCallerMissingError extends Error {
  override name = 'AgentCallerMissingError';

  constructor() {
    super(
      'No agent caller on this request. Add the route’s `onRequest` hook from `authentication.require`.',
    );
  }
}
