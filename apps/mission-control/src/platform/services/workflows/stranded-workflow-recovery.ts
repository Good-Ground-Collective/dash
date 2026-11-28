import { DBOS, type WorkflowStatus } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

const strandedWorkflowRecoveryPropsSchema = z.object({
  graceMs: z
    .number()
    .min(0)
    .default(2 * 60_000)
    .describe(
      'Least age of a queued workflow before it counts as stranded, so one the draining previous container has only just enqueued is left to it.',
    ),
});

/** Gets queued work that a deploy left behind running again. */
export interface StrandedWorkflowRecovery {
  /** How many queued workflows a deploy has stranded right now. */
  count(): Promise<number>;

  /** Re-runs each stranded workflow on the running version, returning how many it moved. */
  recover(): Promise<number>;
}

/**
 * Every deploy runs under a new application version, and a queued workflow is only started by
 * the version it was enqueued under. The replaced container is gone, so work it left waiting
 * would never run and would keep any deduplication ID it holds. This moves such work to the
 * running version under its own ID. Work that has already started is never touched, because the
 * previous container may still be finishing it while a deploy overlaps.
 */
export class DbosStrandedWorkflowRecovery implements StrandedWorkflowRecovery {
  private readonly graceMs: number;

  constructor(props: z.input<typeof strandedWorkflowRecoveryPropsSchema> = {}) {
    this.graceMs = strandedWorkflowRecoveryPropsSchema.parse(props).graceMs;
  }

  async count(): Promise<number> {
    return (await this.stranded()).length;
  }

  async recover(): Promise<number> {
    const version = DBOS.applicationVersion;
    const stranded = await this.stranded();

    for (const workflow of stranded) {
      DBOS.logger.warn(
        `Re-running stranded workflow ${workflow.workflowID} (${workflow.workflowName}) on queue ${workflow.queueName}, queued under version ${workflow.applicationVersion}`,
      );
      await DBOS.cancelWorkflow(workflow.workflowID);
      await DBOS.rewindWorkflow(workflow.workflowID, {
        applicationVersion: version,
        queueName: workflow.queueName,
      });
    }
    return stranded.length;
  }

  private async stranded(): Promise<
    (WorkflowStatus & { queueName: string })[]
  > {
    const cutoff = Date.now() - this.graceMs;
    const queued = await DBOS.listQueuedWorkflows({
      status: ['ENQUEUED', 'DELAYED'],
    });
    return queued.flatMap((workflow) =>
      workflow.applicationVersion !== undefined &&
      workflow.applicationVersion !== DBOS.applicationVersion &&
      workflow.queueName !== undefined &&
      workflow.createdAt <= cutoff
        ? [{ ...workflow, queueName: workflow.queueName }]
        : [],
    );
  }
}
