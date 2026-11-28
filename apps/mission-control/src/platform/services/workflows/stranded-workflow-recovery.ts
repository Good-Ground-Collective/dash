import { DBOS, type WorkflowStatus } from '@dbos-inc/dbos-sdk';
import { getFunctionRegistrationByName } from '@dbos-inc/dbos-sdk/internal/decorators';
import { z } from 'zod';

/**
 * How long a process must have been up before it may move work off another version. A deploy
 * starts the new container, waits up to Kamal's 60 s `deploy_timeout` (deploy/mission-control.yml)
 * for it to be healthy, then drains and stops the old one, which takes the proxy drain and
 * `docker stop` time on top. Five minutes covers all of that with headroom, so by then the
 * previous container is gone and nothing it still runs can be mistaken for work it left behind.
 */
export const previousContainerGoneAfterMs = 5 * 60_000;

const strandableStatuses: readonly string[] = [
  'ENQUEUED',
  'DELAYED',
  'PENDING',
];

const strandedWorkflowRecoveryPropsSchema = z.object({
  gateMs: z
    .number()
    .min(0)
    .default(previousContainerGoneAfterMs)
    .describe(
      'How long after this recovery is created, at startup, before it counts or moves any work, so a previous container still draining is left to finish.',
    ),
  findRegistration: z
    .custom<typeof getFunctionRegistrationByName>()
    .default(() => getFunctionRegistrationByName)
    .describe(
      'Looks up the workflow function this process registered under a class and workflow name. Defaults to the DBOS lookup; it is a prop so tests can simulate a changed DBOS lookup.',
    ),
});

/** Gets queued work that a deploy left behind running again. */
export interface StrandedWorkflowRecovery {
  /** How long until the previous container can be taken to be gone; zero once it can. */
  untilGateOpensMs(): number;

  /** How many queued workflows a deploy has stranded right now; zero while the gate is closed. */
  count(): Promise<number>;

  /** How many queued workflows from another version this version has no workflow function for right now; zero while the gate is closed. They are left alone, so this is for operators to see work that needs a manual look. */
  countUnregistered(): Promise<number>;

  /** Re-runs each stranded workflow on the running version, returning how many it moved. Does nothing while the gate is closed. */
  recover(): Promise<number>;
}

/**
 * Every deploy runs under a new application version, and a queued workflow is only started by
 * the version it was enqueued under. The replaced container is gone, so work it left waiting
 * would never run and would keep any deduplication ID it holds. This moves such work to the
 * running version under its own ID, on its own queue.
 *
 * Only the container running the latest registered version moves work: during a deploy the
 * draining old container is no longer the latest and leaves it to the new one.
 *
 * Nothing is counted or moved until the previous container is gone, because work another
 * version has queued or is running may belong to a container that is still draining: moving a
 * started workflow while its container still runs it would run it twice. Work on a `_dbos`
 * internal queue, work on this version and work on no queue are never touched.
 *
 * Work that had already started is rewound from step 0 rather than resumed: its checkpoints
 * were written by older code, and replaying them against changed code can fail or diverge, so
 * the steps run again on the running version. A briefing that had already committed its record
 * step before the deploy therefore writes a second briefing when it re-runs. That is accepted:
 * it is narrow, and the briefing budget caps it.
 *
 * Cancelling and rewinding both clear a workflow's deduplication ID. A workflow whose ID does not
 * carry the version (`briefing-<userId>`, `objective-reconcile-<connectionId>`) can therefore
 * have a second copy enqueued while the recovered one is still running, so the two may overlap.
 * That is accepted for the same reason: the overlap is narrow and each of those workflows is
 * safe to run twice.
 *
 * Only a workflow whose name this process has registered is moved. Anything else would sit
 * PENDING forever ("Cannot find workflow function") and, on a queue with a concurrency limit such
 * as `briefing`, block every workflow behind it; it is warned about and left alone, and is not
 * counted as stranded.
 */
export class DbosStrandedWorkflowRecovery implements StrandedWorkflowRecovery {
  private readonly gateMs: number;
  private readonly findRegistration: typeof getFunctionRegistrationByName;
  private readonly createdAt = Date.now();

  constructor(props: z.input<typeof strandedWorkflowRecoveryPropsSchema> = {}) {
    const parsed = strandedWorkflowRecoveryPropsSchema.parse(props);
    this.gateMs = parsed.gateMs;
    this.findRegistration = parsed.findRegistration;
  }

  untilGateOpensMs(): number {
    return Math.max(0, this.createdAt + this.gateMs - Date.now());
  }

  async count(): Promise<number> {
    return (await this.partitionOtherVersionWork()).registered.length;
  }

  async countUnregistered(): Promise<number> {
    return (await this.partitionOtherVersionWork()).unregistered.length;
  }

  async recover(): Promise<number> {
    const version = DBOS.applicationVersion;
    let moved = 0;

    const { registered, unregistered } = await this.partitionOtherVersionWork();
    for (const workflow of unregistered) {
      DBOS.logger.warn(
        `Leaving stranded workflow ${workflow.workflowID} (${workflow.workflowName}) on queue ${workflow.queueName} alone: this version has no workflow of that name`,
      );
    }

    for (const workflow of registered) {
      if (!(await this.isStillStranded(workflow.workflowID))) {
        continue;
      }
      DBOS.logger.warn(
        `Re-running stranded workflow ${workflow.workflowID} (${workflow.workflowName}) on queue ${workflow.queueName}, queued under version ${workflow.applicationVersion}`,
      );
      try {
        await DBOS.cancelWorkflow(workflow.workflowID);
      } catch (error) {
        DBOS.logger.warn(
          `Could not re-run stranded workflow ${workflow.workflowID} on queue ${workflow.queueName}: ${error instanceof Error ? error.name : 'non-error thrown'}`,
        );
        continue;
      }
      try {
        await DBOS.rewindWorkflow(workflow.workflowID, {
          applicationVersion: version,
          queueName: workflow.queueName,
        });
        moved += 1;
      } catch (error) {
        DBOS.logger.warn(
          `Stranded workflow ${workflow.workflowID} was cancelled but could not be rewound (${error instanceof Error ? error.name : 'non-error thrown'}); it was left cancelled and needs a manual re-run`,
        );
      }
    }
    return moved;
  }

  /** Re-reads the workflow just before it is moved, because it may have been moved, started or finished since it was listed. */
  private async isStillStranded(workflowID: string): Promise<boolean> {
    const current = await DBOS.getWorkflowStatus(workflowID);
    return (
      current !== null &&
      strandableStatuses.includes(current.status) &&
      current.applicationVersion !== DBOS.applicationVersion
    );
  }

  /** Only the latest registered version may move work; an older, draining container leaves it to the newer one. A failed lookup counts as not latest, so it can never break the schedule or `/healthz`. */
  private async runsLatestVersion(): Promise<boolean> {
    try {
      return (
        (await DBOS.getLatestApplicationVersion()).versionName ===
        DBOS.applicationVersion
      );
    } catch (error) {
      DBOS.logger.warn(
        `Could not read the latest application version, so stranded work is left alone: ${error instanceof Error ? error.name : 'non-error thrown'}`,
      );
      return false;
    }
  }

  /**
   * Whether this process registered a workflow function under the listed name. The DBOS lookup
   * returns `undefined` for an unknown workflow name but throws for an unknown class name, as when
   * a class-based workflow has since been removed; recovery treats that throw as not registered.
   * A throw for a free-function row (`workflowClassName === ''`) is not that case and propagates,
   * so a change in DBOS cannot silently leave every stranded workflow alone.
   *
   * The lookup is `getFunctionRegistrationByName` from `@dbos-inc/dbos-sdk/internal/decorators`,
   * an import path semver does not cover. The catalog pins `@dbos-inc/dbos-sdk` to exactly 5.7.0;
   * re-check this behaviour whenever that pin moves.
   */
  private isRegisteredHere(workflow: WorkflowStatus): boolean {
    try {
      return (
        this.findRegistration(workflow.workflowClassName, workflow.workflowName)
          ?.workflowConfig !== undefined
      );
    } catch (error) {
      if (workflow.workflowClassName === '') {
        throw error;
      }
      return false;
    }
  }

  private async partitionOtherVersionWork(): Promise<{
    registered: (WorkflowStatus & { queueName: string })[];
    unregistered: (WorkflowStatus & { queueName: string })[];
  }> {
    if (this.untilGateOpensMs() > 0 || !(await this.runsLatestVersion())) {
      return { registered: [], unregistered: [] };
    }
    const queued = await DBOS.listQueuedWorkflows({
      status: ['ENQUEUED', 'DELAYED', 'PENDING'],
      loadInput: false,
      loadOutput: false,
    });
    const otherVersions = queued.flatMap((workflow) =>
      workflow.applicationVersion !== undefined &&
      workflow.applicationVersion !== DBOS.applicationVersion &&
      workflow.queueName !== undefined &&
      !workflow.queueName.startsWith('_dbos')
        ? [{ ...workflow, queueName: workflow.queueName }]
        : [],
    );

    const registered: (WorkflowStatus & { queueName: string })[] = [];
    const unregistered: (WorkflowStatus & { queueName: string })[] = [];
    for (const workflow of otherVersions) {
      (this.isRegisteredHere(workflow) ? registered : unregistered).push(
        workflow,
      );
    }
    return { registered, unregistered };
  }
}
