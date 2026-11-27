export class DuplicateIntegrationIdError extends Error {
  override name = 'DuplicateIntegrationIdError';

  constructor(props: { integrationId: string }) {
    super(
      `More than one integration is registered as '${props.integrationId}'`,
    );
  }
}

export class DuplicateCapabilityError extends Error {
  override name = 'DuplicateCapabilityError';

  constructor(props: { capabilityName: string }) {
    super(`Capability '${props.capabilityName}' is already provided`);
  }
}

/** The provider's app can't read trackers that this kind of account owns, such as GitHub Projects owned by a personal account. */
export class TrackerAccountUnsupportedError extends Error {
  override name = 'TrackerAccountUnsupportedError';

  constructor(props: { provider: string; accountKind: string }) {
    super(
      `${props.provider} doesn’t let its app read trackers owned by a ${props.accountKind} account`,
    );
  }
}

/** The provider refused a person's token or refresh token because it was revoked, expired or already spent. They must authorize again. */
export class GrantRevokedError extends Error {
  override name = 'GrantRevokedError';

  constructor(props: { provider: string; cause?: unknown }) {
    super(`${props.provider} no longer accepts this person's grant`, {
      cause: props.cause,
    });
  }
}
