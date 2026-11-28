import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import { AgentHeartbeatRetentionNotRegisteredError } from '#src/agents/errors.ts';
import type { AgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const scheduleName = 'agent-heartbeat-retention-daily';
const dayMilliseconds = 24 * 60 * 60 * 1000;

const agentHeartbeatRetentionWorkflowsPropsSchema = z.object({
  repository:
    z.custom<Pick<AgentHeartbeatRepository, 'deleteReceivedBefore'>>(),
  retentionDays: z.int().positive().default(30),
});

type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/** Once a day, deletes raw heartbeats older than the retention window. Session state keeps the current picture, so nothing reads them after that. */
export class AgentHeartbeatRetentionWorkflows implements WorkflowModule {
  private readonly repository: Pick<
    AgentHeartbeatRepository,
    'deleteReceivedBefore'
  >;
  private readonly retentionDays: number;
  private scheduled: ScheduledWorkflow | null = null;

  constructor(
    props: z.input<typeof agentHeartbeatRetentionWorkflowsPropsSchema>,
  ) {
    const parsed = agentHeartbeatRetentionWorkflowsPropsSchema.parse(props);
    this.repository = parsed.repository;
    this.retentionDays = parsed.retentionDays;
  }

  /** Deletes heartbeats received more than the retention window before `now`, and answers how many. */
  async prune(props: { now: Date }): Promise<number> {
    return this.repository.deleteReceivedBefore({
      cutoff: new Date(
        props.now.getTime() - this.retentionDays * dayMilliseconds,
      ),
    });
  }

  async activate(): Promise<void> {
    if (this.scheduled === null) {
      throw new AgentHeartbeatRetentionNotRegisteredError();
    }
    await DBOS.applySchedules([
      { scheduleName, workflowFn: this.scheduled, schedule: '0 30 3 * * *' },
    ]);
  }

  registerWorkflows(): void {
    this.scheduled = DBOS.registerWorkflow(
      async (firedAt: Date) => {
        const deleted = await DBOS.runStep(() => this.prune({ now: firedAt }), {
          name: 'agentHeartbeatDeleteExpired',
        });
        DBOS.logger.info(
          `Deleted ${deleted} agent heartbeats older than ${this.retentionDays} days`,
        );
      },
      { name: 'agentHeartbeatRetention' },
    );
  }
}
