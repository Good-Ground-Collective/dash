import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import {
  ReconcileNotRegisteredError,
  ReconcileOutsideWorkflowError,
} from '#src/github-feed/errors.ts';
import type {
  GithubReconcile,
  SyncOutcome,
} from '#src/github-feed/services/github-reconcile/github-reconcile.ts';
import type { GithubSyncRequests } from '#src/github-feed/services/github-sync-requests/github-sync-requests.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const queueName = 'github-reconcile';
const scheduleName = 'github-reconcile-every-15-minutes';
/** Least time from one read of a connection starting to a follow-up read of it starting, so steady webhook traffic neither spends the installation's GitHub rate limit nor keeps the queue's two slots busy. */
const minReadGapMs = 60_000;

const githubReconcileWorkflowsPropsSchema = z.object({
  reconcile: z.custom<GithubReconcile>(),
  syncRequests: z.custom<Pick<GithubSyncRequests, 'requestedSince'>>(),
});

/** Reads a connection again on request, from inside or outside a workflow. */
export interface ConnectionReads {
  /** Enqueues a read of the connection unless one is already queued or running. */
  syncConnection(props: { connectionId: string }): Promise<void>;
}

type ConnectionWorkflow = (connectionId: string) => Promise<void>;
type FollowUpWorkflow = (props: {
  connectionId: string;
  readWorkflowId: string;
  startedAt: number;
}) => Promise<void>;
type EnqueueOptions = NonNullable<
  NonNullable<Parameters<typeof DBOS.startWorkflow>[1]>['enqueueOptions']
>;
type PersonWorkflow = (userId: string) => Promise<void>;
type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/**
 * Durable reconcile runs: every 15 minutes, for one person straight after they connect, and
 * for a connection GitHub reports a change in. Each enqueues one workflow per connection on a
 * queue that reads two connections at a time, so a burst never fans out unbounded against
 * GitHub. A connection whose read is still queued or running is not enqueued again; the later
 * request attaches to the earlier read. A change reported while a read runs may be missed by
 * it, so once each read has finished a follow-up checks for a change reported after the read
 * started, and enqueues one more read if there was one. That read waits until a minute after the
 * earlier one started, and requests made while it waits attach to it.
 */
export class GithubReconcileWorkflows
  implements ConnectionReads, WorkflowModule
{
  private readonly reconcile: GithubReconcile;
  private readonly syncRequests: Pick<GithubSyncRequests, 'requestedSince'>;
  private registered: {
    connection: ConnectionWorkflow;
    scheduled: ScheduledWorkflow;
    person: PersonWorkflow;
  } | null = null;

  constructor(props: z.input<typeof githubReconcileWorkflowsPropsSchema>) {
    const parsed = githubReconcileWorkflowsPropsSchema.parse(props);
    this.reconcile = parsed.reconcile;
    this.syncRequests = parsed.syncRequests;
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

  async syncConnection(props: { connectionId: string }): Promise<void> {
    await this.enqueueRead({ connectionId: props.connectionId, delayMs: 0 });
  }

  registerWorkflows(): void {
    const followUp = this.registerFollowUp();
    const connection: ConnectionWorkflow = DBOS.registerWorkflow(
      async (connectionId: string) => {
        const startedAt = await DBOS.now();
        const outcome = await DBOS.runStep(
          () => this.reconcile.syncConnection({ connectionId }),
          { name: 'githubSyncConnection' },
        );
        GithubReconcileWorkflows.log({ connectionId, outcome });

        const readWorkflowId = DBOS.workflowID;
        if (readWorkflowId === undefined) {
          throw new ReconcileOutsideWorkflowError();
        }
        await DBOS.startWorkflow(followUp, {
          workflowID: `${readWorkflowId}-follow-up`,
        })({ connectionId, readWorkflowId, startedAt });
      },
      { name: 'githubReconcileConnection' },
    );
    const enqueue = async (connectionIds: readonly string[]) => {
      for (const connectionId of connectionIds) {
        await this.syncConnection({ connectionId });
      }
    };

    this.registered = {
      connection,
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

  /** Waits for the read to finish, because until it has, enqueueing another read attaches to it. */
  private registerFollowUp(): FollowUpWorkflow {
    return DBOS.registerWorkflow(
      async (props: {
        connectionId: string;
        readWorkflowId: string;
        startedAt: number;
      }) => {
        await DBOS.getResult(props.readWorkflowId);
        const changed = await DBOS.runStep(
          () =>
            this.syncRequests.requestedSince({
              connectionId: props.connectionId,
              since: new Date(props.startedAt),
            }),
          { name: 'githubSyncRequestedSince' },
        );
        if (changed) {
          const now = await DBOS.now();
          await this.enqueueRead({
            connectionId: props.connectionId,
            delayMs: props.startedAt + minReadGapMs - now,
          });
        }
      },
      { name: 'githubReconcileFollowUp' },
    );
  }

  /** Enqueues a read that waits `delayMs` before it can start, unless one is already waiting, queued or running. */
  private async enqueueRead(props: {
    connectionId: string;
    delayMs: number;
  }): Promise<void> {
    if (this.registered === null) {
      throw new ReconcileNotRegisteredError();
    }
    const enqueueOptions: EnqueueOptions = {
      deduplicationID: `github-reconcile-${props.connectionId}`,
    };
    if (props.delayMs > 0) {
      enqueueOptions.delaySeconds = props.delayMs / 1000;
    }
    await DBOS.startWorkflow(this.registered.connection, {
      queueName,
      enqueueOptions,
      duplicationPolicy: 'return-existing',
    })(props.connectionId);
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
