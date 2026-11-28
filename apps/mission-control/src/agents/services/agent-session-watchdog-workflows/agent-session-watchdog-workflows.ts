import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import { AgentSessionWatchdogNotRegisteredError } from '#src/agents/errors.ts';
import type { AgentSessionWatchdog } from '#src/agents/services/agent-session-watchdog/agent-session-watchdog.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

export const agentSessionWatchdogScheduleName =
  'agent-session-watchdog-every-minute';

/** The schedule the removed example heartbeat module applied. DBOS keeps firing a stored schedule whose workflow is gone, so activation deletes it. */
export const retiredExampleScheduleName = 'example-heartbeat-every-30-seconds';

const agentSessionWatchdogWorkflowsPropsSchema = z.object({
  watchdog: z.custom<AgentSessionWatchdog>(),
});

type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/** Every minute, has the watchdog mark working agents that went quiet. */
export class AgentSessionWatchdogWorkflows implements WorkflowModule {
  private readonly watchdog: AgentSessionWatchdog;
  private scheduled: ScheduledWorkflow | null = null;

  constructor(props: z.input<typeof agentSessionWatchdogWorkflowsPropsSchema>) {
    this.watchdog =
      agentSessionWatchdogWorkflowsPropsSchema.parse(props).watchdog;
  }

  async activate(): Promise<void> {
    if (this.scheduled === null) {
      throw new AgentSessionWatchdogNotRegisteredError();
    }
    if ((await DBOS.getSchedule(retiredExampleScheduleName)) !== null) {
      await DBOS.deleteSchedule(retiredExampleScheduleName);
    }
    await DBOS.applySchedules([
      {
        scheduleName: agentSessionWatchdogScheduleName,
        workflowFn: this.scheduled,
        schedule: '0 * * * * *',
      },
    ]);
  }

  registerWorkflows(): void {
    this.scheduled = DBOS.registerWorkflow(
      async (firedAt: Date) => {
        const marked = await DBOS.runStep(
          () => this.watchdog.sweep({ now: firedAt }),
          { name: 'agentSessionMarkSilent' },
        );
        if (marked > 0) {
          DBOS.logger.info(`Marked ${marked} silent agent sessions`);
        }
      },
      { name: 'agentSessionWatchdog' },
    );
  }
}
