import type { ConnectFlow, InstallationChange } from '@dash/integrations-core';
import { z } from 'zod';

import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';

const installationChangesPropsSchema = z.object({
  flows: z.custom<ReadonlyMap<string, ConnectFlow>>(
    (value) => value instanceof Map,
  ),
  connections: z.custom<ConnectionRepository>(),
});

/** Keeps a recorded connection in step with what the provider reports about its installation. */
export interface InstallationChanges {
  apply(props: {
    provider: string;
    installationId: string;
    change: InstallationChange;
  }): Promise<void>;
}

/**
 * An uninstalled app removes its connection and everything read through it. A suspension is
 * recorded as it is, because a suspended installation can't be read. Lifting a suspension or
 * changing the repositories reads the installation again, so the repositories stay current.
 */
export class OwnedInstallationChanges implements InstallationChanges {
  private readonly flows: ReadonlyMap<string, ConnectFlow>;
  private readonly connections: ConnectionRepository;

  constructor(props: z.input<typeof installationChangesPropsSchema>) {
    const { flows, connections } = installationChangesPropsSchema.parse(props);
    this.flows = flows;
    this.connections = connections;
  }

  async apply(props: {
    provider: string;
    installationId: string;
    change: InstallationChange;
  }): Promise<void> {
    const { provider, installationId, change } = props;
    if (change === 'removed') {
      await this.connections.removeInstallation({ provider, installationId });
      return;
    }
    if (change === 'suspended') {
      await this.connections.setSuspended({
        provider,
        installationId,
        suspended: true,
      });
      return;
    }

    const flow = this.flows.get(provider);
    if (
      flow === undefined ||
      !(await this.connections.hasInstallation({ provider, installationId }))
    ) {
      return;
    }
    await this.connections.refreshOwned({
      provider,
      installation: await flow.getInstallation({ installationId }),
    });
  }
}
