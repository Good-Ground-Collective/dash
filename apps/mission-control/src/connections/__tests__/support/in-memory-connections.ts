import type { Installation, WebhookDelivery } from '@dash/integrations-core';

import type { OwnedConnection } from '#src/connections/contracts/connections.ts';
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
      (connection) => connection.provider === props.provider,
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

export class InMemoryWebhookDeliveryRepository implements WebhookDeliveryRepository {
  readonly deliveries: (WebhookDelivery & { provider: string })[] = [];

  async record(props: {
    provider: string;
    delivery: WebhookDelivery;
  }): Promise<{ duplicate: boolean }> {
    const duplicate = this.deliveries.some(
      (stored) =>
        stored.provider === props.provider &&
        stored.deliveryId === props.delivery.deliveryId,
    );
    if (!duplicate) {
      this.deliveries.push({ ...props.delivery, provider: props.provider });
    }
    return { duplicate };
  }
}
