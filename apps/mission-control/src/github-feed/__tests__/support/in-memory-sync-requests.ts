import type { SyncRequestRepository } from '#src/github-feed/repositories/sync-requests/sync-request-repository.ts';

export class InMemorySyncRequestRepository implements SyncRequestRepository {
  readonly requested = new Map<string, Date>();

  async request(props: {
    connectionId: string;
    requestedAt: Date;
  }): Promise<void> {
    const previous = this.requested.get(props.connectionId);
    if (previous === undefined || previous < props.requestedAt) {
      this.requested.set(props.connectionId, props.requestedAt);
    }
  }

  async requestedSince(props: {
    connectionId: string;
    since: Date;
  }): Promise<boolean> {
    const requested = this.requested.get(props.connectionId);
    return requested !== undefined && requested >= props.since;
  }
}
