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
