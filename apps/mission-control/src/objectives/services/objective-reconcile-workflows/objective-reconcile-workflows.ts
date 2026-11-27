import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import { ObjectiveReconcileNotRegisteredError } from '#src/objectives/errors.ts';
import type {
  ObjectiveReconcile,
  ObjectiveSyncOutcome,
} from '#src/objectives/services/objective-reconcile/objective-reconcile.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const queueName = 'objective-reconcile';
const scheduleName = 'objective-reconcile-every-15-minutes';

/**
 * Retries for a connection read, wherever it starts. Tracker errors are caught inside the read,
 * so a retry follows a database failure, and each retry repeats the whole tracker read, so the
 * attempts stay few.
 */
const readStepRetries = {
  retriesAllowed: true,
  maxAttempts: 3,
  intervalSeconds: 1,
  backoffRate: 2,
};

const objectiveReconcileWorkflowsPropsSchema = z.object({
  reconcile: z.custom<ObjectiveReconcile>(),
});

type ConnectionWorkflow = (connectionId: string) => Promise<void>;
type PersonWorkflow = (userId: string) => Promise<void>;
type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/**
 * Durable objective reads: every 15 minutes, for one person straight after they connect, and for
 * a connection whose suspension lifted. Each enqueues one workflow per connection on a queue that
 * reads two connections at a time. A connection whose read is still queued or running is not
 * enqueued again; the later request attaches to the earlier read.
 */
export class ObjectiveReconcileWorkflows implements WorkflowModule {
  private readonly reconcile: ObjectiveReconcile;
  private registered: {
    connection: ConnectionWorkflow;
    scheduled: ScheduledWorkflow;
    person: PersonWorkflow;
  } | null = null;

  constructor(props: z.input<typeof objectiveReconcileWorkflowsPropsSchema>) {
    const parsed = objectiveReconcileWorkflowsPropsSchema.parse(props);
    this.reconcile = parsed.reconcile;
  }

  async activate(): Promise<void> {
    if (this.registered === null) {
      throw new ObjectiveReconcileNotRegisteredError();
    }
    await DBOS.registerQueue(queueName, { workerConcurrency: 2 });
    await DBOS.applySchedules([
      {
        scheduleName,
        workflowFn: this.registered.scheduled,
        schedule: '0 */15 * * * *',
      },
    ]);
  }

  /** Starts reading the tracker of every connection `userId` made, without waiting for it. */
  async syncPerson(props: { userId: string }): Promise<void> {
    if (this.registered === null) {
      throw new ObjectiveReconcileNotRegisteredError();
    }
    await DBOS.startWorkflow(this.registered.person, { queueName })(
      props.userId,
    );
  }

  /** Enqueues a read of the connection unless one is already queued or running; the request then attaches to that read. */
  async syncConnection(props: { connectionId: string }): Promise<void> {
    if (this.registered === null) {
      throw new ObjectiveReconcileNotRegisteredError();
    }
    await DBOS.startWorkflow(this.registered.connection, {
      queueName,
      enqueueOptions: {
        deduplicationID: `objective-reconcile-${props.connectionId}`,
      },
      duplicationPolicy: 'return-existing',
    })(props.connectionId);
  }

  registerWorkflows(): void {
    const enqueue = async (connectionIds: readonly string[]) => {
      for (const connectionId of connectionIds) {
        await this.syncConnection({ connectionId });
      }
    };

    this.registered = {
      connection: DBOS.registerWorkflow(
        async (connectionId: string) => {
          const outcome = await DBOS.runStep(
            () => this.reconcile.syncConnection({ connectionId }),
            { ...readStepRetries, name: 'objectiveSyncConnection' },
          );
          ObjectiveReconcileWorkflows.log({ connectionId, outcome });
        },
        { name: 'objectiveReconcileConnection' },
      ),
      person: DBOS.registerWorkflow(
        async (userId: string) => {
          await enqueue(
            await DBOS.runStep(
              () => this.reconcile.connectionIdsOf({ userId }),
              { name: 'objectiveConnectionsOfPerson' },
            ),
          );
        },
        { name: 'objectiveReconcilePerson' },
      ),
      scheduled: DBOS.registerWorkflow(
        async () => {
          await enqueue(
            await DBOS.runStep(() => this.reconcile.dueConnectionIds(), {
              name: 'objectiveDueConnections',
            }),
          );
        },
        { name: 'objectiveReconcileScheduled' },
      ),
    };
  }

  private static log(props: {
    connectionId: string;
    outcome: ObjectiveSyncOutcome;
  }): void {
    if (props.outcome.status === 'failed') {
      DBOS.logger.warn(
        `Objective reconcile of connection ${props.connectionId} failed: ${props.outcome.error}`,
      );
    }
  }
}
