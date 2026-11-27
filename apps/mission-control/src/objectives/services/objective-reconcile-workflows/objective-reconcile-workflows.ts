import { DBOS } from '@dbos-inc/dbos-sdk';

import { ObjectiveReconcileNotRegisteredError } from '#src/objectives/errors.ts';
import type {
  ObjectiveReconcile,
  ObjectiveSyncOutcome,
} from '#src/objectives/services/objective-reconcile/objective-reconcile.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const queueName = 'objective-reconcile';
const scheduleName = 'objective-reconcile-every-15-minutes';

type ConnectionWorkflow = (connectionId: string) => Promise<void>;
type PersonWorkflow = (userId: string) => Promise<void>;
type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/**
 * Durable objective reads: every 15 minutes, and for one person straight after they connect.
 * Both enqueue one workflow per connection on a queue that reads two connections at a time.
 * A connection whose read is still queued or running is not enqueued again; the later run
 * attaches to the earlier one.
 */
export class ObjectiveReconcileWorkflows implements WorkflowModule {
  private readonly reconcile: ObjectiveReconcile;
  private registered: {
    scheduled: ScheduledWorkflow;
    person: PersonWorkflow;
  } | null = null;

  constructor(props: { reconcile: ObjectiveReconcile }) {
    this.reconcile = props.reconcile;
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

  registerWorkflows(): void {
    const connection: ConnectionWorkflow = DBOS.registerWorkflow(
      async (connectionId: string) => {
        const outcome = await DBOS.runStep(
          () => this.reconcile.syncConnection({ connectionId }),
          { name: 'objectiveSyncConnection' },
        );
        ObjectiveReconcileWorkflows.log({ connectionId, outcome });
      },
      { name: 'objectiveReconcileConnection' },
    );
    const enqueue = async (connectionIds: readonly string[]) => {
      for (const connectionId of connectionIds) {
        await DBOS.startWorkflow(connection, {
          queueName,
          enqueueOptions: {
            deduplicationID: `objective-reconcile-${connectionId}`,
          },
          duplicationPolicy: 'return-existing',
        })(connectionId);
      }
    };

    this.registered = {
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
