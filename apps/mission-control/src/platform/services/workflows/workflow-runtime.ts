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
  recovery: z
    .custom<StrandedWorkflowRecovery>()
    .optional()
    .describe(
      'Moves work a deploy stranded; share it with whatever reports on that work. Defaults to a new one created with the runtime.',
    ),
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
  private readonly recovery: StrandedWorkflowRecovery;
  private recoverStranded: (() => Promise<void>) | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(props: z.input<typeof workflowRuntimePropsSchema>) {
    this.props = workflowRuntimePropsSchema.parse(props);
    this.recovery = this.props.recovery ?? new DbosStrandedWorkflowRecovery();
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
    await this.becomeLatestVersion();

    this.sweepWhenPreviousContainerIsGone();
    await DBOS.applySchedules([
      {
        scheduleName: recoveryScheduleName,
        workflowFn: this.recoverStranded,
        schedule: '0 */15 * * * *',
      },
    ]);
  }

  async shutdown(): Promise<void> {
    if (this.sweepTimer !== null) {
      clearTimeout(this.sweepTimer);
      this.sweepTimer = null;
    }
    await DBOS.shutdown();
  }

  /**
   * After a rollback or revert deploy DBOS reclaims this version's existing row without making it
   * the latest, so it would stay behind a version that no longer runs: the scheduler enqueues to
   * the latest version, and only the latest version moves stranded work. Mission Control runs on a
   * single host where the newest container is the intended one, so it claims latest at launch.
   */
  private async becomeLatestVersion(): Promise<void> {
    await DBOS.setLatestApplicationVersion(DBOS.applicationVersion);
  }

  /** Sweeps once as soon as the previous container is gone, instead of waiting for the next schedule tick. A failed sweep is logged, never thrown; the schedule tries again. */
  private sweepWhenPreviousContainerIsGone(): void {
    this.sweepTimer = setTimeout(() => {
      void this.sweep();
    }, this.recovery.untilGateOpensMs());
    this.sweepTimer.unref();
  }

  private async sweep(): Promise<void> {
    try {
      await this.recovery.recover();
    } catch (error) {
      DBOS.logger.warn(
        `Recovering stranded workflows failed: ${error instanceof Error ? error.name : 'non-error thrown'}`,
      );
    }
  }
}
