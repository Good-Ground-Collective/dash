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
  forceLatestVersion: z
    .boolean()
    .default(false)
    .describe(
      'Claim "latest" at launch even when a newer version holds it. Set for a rollback deploy, where the older version is the one meant to run.',
    ),
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
   * Claims "latest" so the scheduler enqueues to this version and this version moves stranded
   * work: after a rollback or revert deploy DBOS reclaims an existing version row without making
   * it the latest. A container never takes "latest" from a version created after its own, so an
   * old container that restarts during the overlap of a deploy leaves the new one in charge.
   * Rolling back on purpose therefore needs `DASH_CLAIM_LATEST_VERSION=force`, which claims
   * regardless; the README's rollback steps set it. So does a failed deploy: the new container
   * claims "latest" at launch, before it listens, so if it then fails its health check the surviving
   * old container no longer holds the marker and a plain restart will not reclaim it. Set
   * `DASH_CLAIM_LATEST_VERSION: force` and deploy the version still running; once it is healthy,
   * remove the switch and deploy the same version again, because Kamal applies `env.clear` only
   * when it creates a container (README, "Rolling back"). The
   * `holdsLatestVersion` gauge on `/healthz` reads 0 while the running container lacks the marker.
   */
  private async becomeLatestVersion(): Promise<void> {
    const version = DBOS.applicationVersion;
    if (!this.props.forceLatestVersion && (await this.newerVersionIsLatest())) {
      DBOS.logger.warn(
        `Leaving "latest" with a newer application version; ${version} did not claim it`,
      );
      return;
    }
    await DBOS.setLatestApplicationVersion(version);
  }

  private async newerVersionIsLatest(): Promise<boolean> {
    const latest = await DBOS.getLatestApplicationVersion();
    if (latest.versionName === DBOS.applicationVersion) {
      return false;
    }
    const own = (await DBOS.listApplicationVersions()).find(
      (candidate) => candidate.versionName === DBOS.applicationVersion,
    );
    return own !== undefined && latest.createdAt > own.createdAt;
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
