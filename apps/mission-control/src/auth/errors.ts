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
