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
