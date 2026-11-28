import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';
import {
  logLevelSchema,
  postgresUrlSchema,
} from '#src/platform/definitions/config/app-config.ts';
import { WorkflowRuntimeError } from '#src/platform/errors.ts';
import {
  DbosStrandedWorkflowRecovery,
  type StrandedWorkflowRecovery,
} from '#src/platform/services/workflows/stranded-workflow-recovery.ts';

const recoveryScheduleName = 'recover-stranded-workflows-every-15-minutes';

const dbosLogLevels = {
  fatal: 'error',
  error: 'error',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'debug',
  silent: 'error',
} as const satisfies Record<
  z.infer<typeof logLevelSchema>,
  'debug' | 'info' | 'warn' | 'error'
>;

export const workflowRuntimePropsSchema = z.object({
  databaseUrl: postgresUrlSchema,
  logLevel: logLevelSchema,
});

/** `launch` must follow every module's `registerWorkflows()`, because DBOS fixes its registry at launch. */
export interface WorkflowRuntime extends HealthProbe {
  launch(): Promise<void>;
  shutdown(): Promise<void>;
}

/** DBOS keeps its system tables in the `dbos` schema of the application database. */
export class DbosWorkflowRuntime implements WorkflowRuntime {
  readonly name = 'workflows';
  private readonly props: z.output<typeof workflowRuntimePropsSchema>;
  private readonly recovery: StrandedWorkflowRecovery =
    new DbosStrandedWorkflowRecovery();
  private recoverStranded: (() => Promise<void>) | null = null;

  constructor(props: z.input<typeof workflowRuntimePropsSchema>) {
    this.props = workflowRuntimePropsSchema.parse(props);
  }

  async check(): Promise<void> {
    if (!DBOS.isInitialized()) {
      throw new WorkflowRuntimeError({ message: 'DBOS is not launched' });
    }
    await DBOS.getLatestApplicationVersion();
  }

  async launch(): Promise<void> {
    DBOS.setConfig({
      name: 'mission-control',
      systemDatabaseUrl: this.props.databaseUrl,
      systemDatabaseSchemaName: 'dbos',
      logLevel: dbosLogLevels[this.props.logLevel],
    });
    this.recoverStranded ??= DBOS.registerWorkflow(
      async () => {
        await DBOS.runStep(() => this.recovery.recover(), {
          name: 'recoverStrandedWorkflows',
        });
      },
      { name: 'recoverStrandedWorkflows' },
    );
    await DBOS.launch();

    await this.recoverAfterLaunch();
    await DBOS.applySchedules([
      {
        scheduleName: recoveryScheduleName,
        workflowFn: this.recoverStranded,
        schedule: '0 */15 * * * *',
      },
    ]);
  }

  async shutdown(): Promise<void> {
    await DBOS.shutdown();
  }

  /** A failed sweep must not stop the app starting; the schedule tries again. */
  private async recoverAfterLaunch(): Promise<void> {
    try {
      await this.recovery.recover();
    } catch (error) {
      DBOS.logger.warn(
        `Recovering stranded workflows failed: ${error instanceof Error ? error.name : 'non-error thrown'}`,
      );
    }
  }
}
