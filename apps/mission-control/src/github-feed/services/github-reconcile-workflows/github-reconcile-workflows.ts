import { DBOS } from '@dbos-inc/dbos-sdk';

import { ReconcileNotRegisteredError } from '#src/github-feed/errors.ts';
import type {
  GithubReconcile,
  SyncOutcome,
} from '#src/github-feed/services/github-reconcile/github-reconcile.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const queueName = 'github-reconcile';
const scheduleName = 'github-reconcile-every-15-minutes';

type ConnectionWorkflow = (connectionId: string) => Promise<void>;
type PersonWorkflow = (userId: string) => Promise<void>;
type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/**
 * Durable reconcile runs: every 15 minutes, and for one person straight after they connect.
 * Both enqueue one workflow per connection on a queue that reads two connections at a time,
 * so a burst of connections never fans out unbounded against GitHub. A connection whose read
 * is still queued or running is not enqueued again; the later run attaches to the earlier one.
 */
export class GithubReconcileWorkflows implements WorkflowModule {
  private readonly reconcile: GithubReconcile;
  private registered: {
    scheduled: ScheduledWorkflow;
    person: PersonWorkflow;
  } | null = null;

  constructor(props: { reconcile: GithubReconcile }) {
    this.reconcile = props.reconcile;
  }

  async activate(): Promise<void> {
    if (this.registered === null) {
      throw new ReconcileNotRegisteredError();
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

  /** Starts reading every GitHub connection `userId` made, without waiting for it. */
  async syncPerson(props: { userId: string }): Promise<void> {
    if (this.registered === null) {
      throw new ReconcileNotRegisteredError();
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
          { name: 'githubSyncConnection' },
        );
        GithubReconcileWorkflows.log({ connectionId, outcome });
      },
      { name: 'githubReconcileConnection' },
    );
    const enqueue = async (connectionIds: readonly string[]) => {
      for (const connectionId of connectionIds) {
        await DBOS.startWorkflow(connection, {
          queueName,
          enqueueOptions: {
            deduplicationID: `github-reconcile-${connectionId}`,
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
              { name: 'githubConnectionsOfPerson' },
            ),
          );
        },
        { name: 'githubReconcilePerson' },
      ),
      scheduled: DBOS.registerWorkflow(
        async () => {
          await enqueue(
            await DBOS.runStep(() => this.reconcile.dueConnectionIds(), {
              name: 'githubDueConnections',
            }),
          );
        },
        { name: 'githubReconcileScheduled' },
      ),
    };
  }

  private static log(props: {
    connectionId: string;
    outcome: SyncOutcome;
  }): void {
    if (props.outcome.status === 'failed') {
      DBOS.logger.warn(
        `GitHub reconcile of connection ${props.connectionId} failed: ${props.outcome.error}`,
      );
    }
  }
}
