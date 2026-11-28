import { z } from 'zod';

import { ConfigError } from '#src/platform/errors.ts';

const workflowRuntimeEnvironmentSchema = z
  .object({
    DASH_CLAIM_LATEST_VERSION: z
      .enum(['force'])
      .optional()
      .describe(
        'Set to `force` for a rollback deploy, so this container claims the latest application version even when a newer one holds it.',
      ),
  })
  .transform((env) => ({
    forceLatestVersion: env.DASH_CLAIM_LATEST_VERSION === 'force',
  }));

/** The workflow runtime's deploy-time switches, read from the container's environment. */
export class WorkflowRuntimeConfig {
  readonly forceLatestVersion: boolean;

  /** Parses `env`, throwing a `ConfigError` for a value other than `force`, so a mistyped rollback switch fails the deploy's health check instead of being ignored. */
  constructor(env: NodeJS.ProcessEnv) {
    const parsed = workflowRuntimeEnvironmentSchema.safeParse(env);
    if (!parsed.success) {
      throw new ConfigError({ details: z.prettifyError(parsed.error) });
    }
    this.forceLatestVersion = parsed.data.forceLatestVersion;
  }

  static fromEnvironment(): WorkflowRuntimeConfig {
    return new WorkflowRuntimeConfig(process.env);
  }
}
