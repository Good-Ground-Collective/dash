export class ConfigError extends Error {
  override name = 'ConfigError';

  constructor(props: { details: string }) {
    super(`Invalid environment configuration:\n${props.details}`);
  }
}

export class WorkflowRuntimeError extends Error {
  override name = 'WorkflowRuntimeError';

  constructor(props: { message: string }) {
    super(props.message);
  }
}

/** A schema whose largest JSON can't be bounded, such as one with an array and no `maxItems`. */
export class UnboundedJsonSchemaError extends Error {
  override name = 'UnboundedJsonSchemaError';

  constructor(props: { reason: string }) {
    super(`The schema has no largest JSON: ${props.reason}.`);
  }
}
