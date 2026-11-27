import { z } from 'zod';

import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type { SyncRequestRepository } from '#src/github-feed/repositories/sync-requests/sync-request-repository.ts';

const githubSyncRequestsPropsSchema = z.object({
  connections: z.custom<Pick<ConnectionRepository, 'connectionIdsFor'>>(),
  requests: z.custom<SyncRequestRepository>(),
});

/** Notes when GitHub reports a change to a connection, so a read already under way can tell it started too early. */
export interface GithubSyncRequests {
  /** Records the change for the installation's connection and returns its id, or null when Dash has no connection for it. */
  request(props: {
    installationId: string;
    requestedAt: Date;
  }): Promise<string | null>;
  /** Whether a change was reported at or after `since`. */
  requestedSince(props: {
    connectionId: string;
    since: Date;
  }): Promise<boolean>;
}

export class RecordedGithubSyncRequests implements GithubSyncRequests {
  private readonly connections: Pick<ConnectionRepository, 'connectionIdsFor'>;
  private readonly requests: SyncRequestRepository;

  constructor(props: z.input<typeof githubSyncRequestsPropsSchema>) {
    const parsed = githubSyncRequestsPropsSchema.parse(props);
    this.connections = parsed.connections;
    this.requests = parsed.requests;
  }

  async request(props: {
    installationId: string;
    requestedAt: Date;
  }): Promise<string | null> {
    const ids = await this.connections.connectionIdsFor({
      provider: 'github',
      installationIds: [props.installationId],
    });
    const connectionId = ids.get(props.installationId);
    if (connectionId === undefined) {
      return null;
    }
    await this.requests.request({
      connectionId,
      requestedAt: props.requestedAt,
    });
    return connectionId;
  }

  async requestedSince(props: {
    connectionId: string;
    since: Date;
  }): Promise<boolean> {
    return this.requests.requestedSince(props);
  }
}
