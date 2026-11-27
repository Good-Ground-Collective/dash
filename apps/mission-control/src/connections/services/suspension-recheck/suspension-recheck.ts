import type { ConnectFlow } from '@dash/integrations-core';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { z } from 'zod';

import type { ConnectListener } from '#src/connections/contracts/connect-listener.ts';
import { SuspensionRecheckNotRegisteredError } from '#src/connections/errors.ts';
import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const scheduleName = 'connections-suspension-recheck-every-15-minutes';
/** The most suspended connections one run asks about, the same cap as a scheduled feed read. */
const maxConnectionsPerRun = 50;

const suspensionRecheckPropsSchema = z.object({
  flows: z.custom<ReadonlyMap<string, ConnectFlow>>(
    (value) => value instanceof Map,
  ),
  connections: z.custom<ConnectionRepository>(),
  listener: z.custom<ConnectListener>().optional(),
});

export type SuspendedInstallation = {
  provider: string;
  installationId: string;
};

type ScheduledWorkflow = (firedAt: Date) => Promise<void>;

/** Lifts a recorded suspension the provider no longer reports, without waiting for its webhook. */
export interface SuspensionRecheck {
  /** Suspended owned connections to ask about, least recently updated first. */
  due(): Promise<SuspendedInstallation[]>;
  /** Asks the provider again. Reads the installation and returns true once the suspension has lifted. */
  recheck(installation: SuspendedInstallation): Promise<boolean>;
}

/**
 * Every 15 minutes, asks the provider about each suspended connection in turn. A connection still
 * suspended is touched, so the next run asks about others first. One whose suspension has lifted
 * is read again and announced to the listener, so a lost unsuspend delivery heals by itself.
 */
export class DbosSuspensionRecheck
  implements SuspensionRecheck, WorkflowModule
{
  private readonly flows: ReadonlyMap<string, ConnectFlow>;
  private readonly connections: ConnectionRepository;
  private readonly listener: ConnectListener | undefined;
  private scheduled: ScheduledWorkflow | null = null;

  constructor(props: z.input<typeof suspensionRecheckPropsSchema>) {
    const parsed = suspensionRecheckPropsSchema.parse(props);
    this.flows = parsed.flows;
    this.connections = parsed.connections;
    this.listener = parsed.listener;
  }

  async due(): Promise<SuspendedInstallation[]> {
    const owned = await Promise.all(
      [...this.flows.keys()].map(async (provider) =>
        this.connections.listOwned({ provider }),
      ),
    );
    return owned
      .flat()
      .filter(({ suspended }) => suspended)
      .toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .slice(0, maxConnectionsPerRun)
      .map(({ provider, installationId }) => ({ provider, installationId }));
  }

  async recheck(installation: SuspendedInstallation): Promise<boolean> {
    const { provider, installationId } = installation;
    const flow = this.flows.get(provider);
    if (flow === undefined) {
      return false;
    }
    if (await flow.isInstallationSuspended({ installationId })) {
      await this.connections.setSuspended({
        provider,
        installationId,
        suspended: true,
      });
      return false;
    }

    const current = await flow.getInstallation({ installationId });
    const refreshed = await this.connections.refreshOwned({
      provider,
      installation: current,
    });
    return refreshed && !current.suspended;
  }

  async activate(): Promise<void> {
    if (this.scheduled === null) {
      throw new SuspensionRecheckNotRegisteredError();
    }
    await DBOS.applySchedules([
      {
        scheduleName,
        workflowFn: this.scheduled,
        schedule: '0 */15 * * * *',
      },
    ]);
  }

  registerWorkflows(): void {
    this.scheduled = DBOS.registerWorkflow(
      async () => {
        const due = await DBOS.runStep(() => this.due(), {
          name: 'connectionsSuspendedDue',
        });
        for (const installation of due) {
          const lifted = await DBOS.runStep(
            () => this.recheckOrKeep(installation),
            { name: 'connectionsRecheckSuspension' },
          );
          if (lifted) {
            await this.announce(installation);
          }
        }
      },
      { name: 'connectionsSuspensionRecheck' },
    );
  }

  /** One provider failure leaves that suspension for the next run instead of ending this one. */
  private async recheckOrKeep(
    installation: SuspendedInstallation,
  ): Promise<boolean> {
    try {
      return await this.recheck(installation);
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      DBOS.logger.warn(
        `Rechecking the suspension of ${installation.provider} installation ${installation.installationId} failed: ${reason}`,
      );
      return false;
    }
  }

  /** A listener's failure is logged: the connection is readable again, and the next scheduled read catches up. */
  private async announce(installation: SuspendedInstallation): Promise<void> {
    try {
      await this.listener?.reinstated(installation);
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      DBOS.logger.warn(
        `Starting a read after reinstating ${installation.provider} installation ${installation.installationId} failed: ${reason}`,
      );
    }
  }
}
