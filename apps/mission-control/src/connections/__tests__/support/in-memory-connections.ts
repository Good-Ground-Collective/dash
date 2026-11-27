import type { Installation, WebhookDelivery } from '@dash/integrations-core';

import type { OwnedConnection } from '#src/connections/contracts/connections.ts';
import type { DispatchedDelivery } from '#src/connections/contracts/webhook-events.ts';
import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type {
  LinkedAccountRepository,
  StoredLinkedAccount,
} from '#src/connections/repositories/linked-accounts/linked-account-repository.ts';
import type { WebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';

export class InMemoryConnectionRepository implements ConnectionRepository {
  readonly owned = new Map<string, OwnedConnection>();

  async saveOwned(props: {
    provider: string;
    connectedBy: string;
    installation: Installation;
  }): Promise<OwnedConnection> {
    const key = `${props.provider}:${props.installation.externalId}`;
    const now = new Date().toISOString();
    const existing = this.owned.get(key);
    const { installation } = props;
    const connection: OwnedConnection = {
      id: existing?.id ?? crypto.randomUUID(),
      provider: props.provider,
      kind: 'owned',
      installationId: installation.externalId,
      account: installation.account,
      repositorySelection: installation.repositorySelection,
      repositories: installation.repositories,
      suspended: installation.suspended,
      settingsUrl: installation.url,
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
    };
    this.owned.set(key, connection);
    return connection;
  }

  async listOwned(props: { provider: string }): Promise<OwnedConnection[]> {
    return [...this.owned.values()].filter(
      (connection) => connection.provider === props.provider,
    );
  }

  async exists(props: { provider: string }): Promise<boolean> {
    return [...this.owned.values()].some(
      (connection) =>
        connection.provider === props.provider && !connection.suspended,
    );
  }

  async hasInstallation(props: {
    provider: string;
    installationId: string;
  }): Promise<boolean> {
    return [...this.owned.values()].some(
      (connection) =>
        connection.provider === props.provider &&
        connection.installationId === props.installationId,
    );
  }

  async connectionIdsFor(props: {
    provider: string;
    installationIds: readonly string[];
  }): Promise<ReadonlyMap<string, string>> {
    return new Map(
      [...this.owned.values()]
        .filter(
          (connection) =>
            connection.provider === props.provider &&
            props.installationIds.includes(connection.installationId),
        )
        .map((connection) => [connection.installationId, connection.id]),
    );
  }

  async refreshOwned(props: {
    provider: string;
    installation: Installation;
  }): Promise<boolean> {
    const { installation } = props;
    const key = `${props.provider}:${installation.externalId}`;
    const existing = this.owned.get(key);
    if (existing === undefined) {
      return false;
    }
    this.owned.set(key, {
      ...existing,
      account: installation.account,
      repositorySelection: installation.repositorySelection,
      repositories: installation.repositories,
      suspended: installation.suspended,
      settingsUrl: installation.url,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  async setSuspended(props: {
    provider: string;
    installationId: string;
    suspended: boolean;
  }): Promise<void> {
    const key = `${props.provider}:${props.installationId}`;
    const existing = this.owned.get(key);
    if (existing !== undefined) {
      this.owned.set(key, { ...existing, suspended: props.suspended });
    }
  }

  async removeInstallation(props: {
    provider: string;
    installationId: string;
  }): Promise<void> {
    this.owned.delete(`${props.provider}:${props.installationId}`);
  }
}

export class InMemoryLinkedAccountRepository implements LinkedAccountRepository {
  readonly rows = new Map<string, StoredLinkedAccount>();

  async find(props: {
    userId: string;
    provider: string;
  }): Promise<StoredLinkedAccount | null> {
    return this.rows.get(`${props.userId}:${props.provider}`) ?? null;
  }

  async findOwner(props: {
    provider: string;
    externalId: string;
  }): Promise<string | null> {
    const row = [...this.rows.values()].find(
      (linked) =>
        linked.account.provider === props.provider &&
        linked.account.externalId === props.externalId,
    );
    return row?.userId ?? null;
  }

  async save(linked: StoredLinkedAccount): Promise<void> {
    this.rows.set(`${linked.userId}:${linked.account.provider}`, linked);
  }
}

export interface StoredDelivery extends WebhookDelivery {
  provider: string;
  dispatchPending: boolean;
  receivedAt: Date;
}

export class InMemoryWebhookDeliveryRepository implements WebhookDeliveryRepository {
  readonly deliveries: StoredDelivery[] = [];

  async record(props: {
    provider: string;
    delivery: WebhookDelivery;
    dispatchPending: boolean;
  }): Promise<{ duplicate: boolean }> {
    const duplicate = this.find(props.provider, props.delivery.deliveryId);
    if (duplicate === undefined) {
      this.deliveries.push({
        ...props.delivery,
        provider: props.provider,
        dispatchPending: props.dispatchPending,
        receivedAt: new Date(),
      });
    }
    return { duplicate: duplicate !== undefined };
  }

  async markDispatched(props: {
    provider: string;
    deliveryId: string;
  }): Promise<void> {
    const stored = this.find(props.provider, props.deliveryId);
    if (stored !== undefined) {
      stored.dispatchPending = false;
    }
  }

  async pendingDispatch(props: {
    receivedBefore: Date;
    limit: number;
  }): Promise<DispatchedDelivery[]> {
    return this.deliveries
      .filter(
        (stored) =>
          stored.dispatchPending && stored.receivedAt < props.receivedBefore,
      )
      .slice(0, props.limit)
      .map((stored) => ({
        provider: stored.provider,
        deliveryId: stored.deliveryId,
        event: stored.event,
        action: stored.action,
        installationId: stored.installationId,
        installationChange: stored.installationChange,
      }));
  }

  async deleteReceivedBefore(props: { cutoff: Date }): Promise<number> {
    const kept = this.deliveries.filter(
      (stored) => stored.receivedAt >= props.cutoff,
    );
    const deleted = this.deliveries.length - kept.length;
    this.deliveries.splice(0, this.deliveries.length, ...kept);
    return deleted;
  }

  private find(provider: string, deliveryId: string) {
    return this.deliveries.find(
      (stored) =>
        stored.provider === provider && stored.deliveryId === deliveryId,
    );
  }
}
