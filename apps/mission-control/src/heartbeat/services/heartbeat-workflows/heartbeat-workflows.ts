import { DBOS } from '@dbos-inc/dbos-sdk';

import type { HeartbeatRecorder } from '#src/heartbeat/services/heartbeat-recorder/heartbeat-recorder.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const queueName = 'example-heartbeats';
const scheduleName = 'example-heartbeat-every-30-seconds';

/**
 * Example DBOS wiring, to be replaced by real workflows: a cron schedule fires every
 * 30 seconds and enqueues a workflow on a queue, whose step records the heartbeat.
 */
export class HeartbeatWorkflows implements WorkflowModule {
  private readonly recorder: HeartbeatRecorder;
  private scheduled: ((firedAt: Date) => Promise<void>) | null = null;

  constructor(props: { recorder: HeartbeatRecorder }) {
    this.recorder = props.recorder;
  }

  async activate(): Promise<void> {
    if (this.scheduled === null) {
      throw new Error(
        'Register the heartbeat workflows before activating them',
      );
    }
    await DBOS.registerQueue(queueName, { workerConcurrency: 1 });
    await DBOS.applySchedules([
      { scheduleName, workflowFn: this.scheduled, schedule: '*/30 * * * * *' },
    ]);
  }

  registerWorkflows(): void {
    const record = DBOS.registerWorkflow(
      async (firedAt: string) => {
        await DBOS.runStep(
          () => this.recorder.record({ firedAt: new Date(firedAt) }),
          {
            name: 'recordHeartbeat',
          },
        );
      },
      { name: 'exampleRecordHeartbeat' },
    );
    this.scheduled = DBOS.registerWorkflow(
      async (firedAt: Date) => {
        await DBOS.startWorkflow(record, { queueName })(firedAt.toISOString());
      },
      { name: 'exampleScheduledHeartbeat' },
    );
  }
}
