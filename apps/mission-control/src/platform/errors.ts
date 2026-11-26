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
