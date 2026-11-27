import {
  type ConnectFlow,
  GrantRevokedError,
  type UserAccount,
} from '@dash/integrations-core';

import type {
  InstalledState,
  RequestedState,
} from '#src/connections/contracts/connections.ts';
import type {
  ConnectionRepository,
  InstallRequest,
} from '#src/connections/repositories/connections/connection-repository.ts';
import type { OwnedConnections } from '#src/connections/services/owned-connections/owned-connections.ts';

/** An entry before the routes add the links, which need a state issued per request. */
export interface ListedAccount {
  account: UserAccount;
  install: InstalledState | RequestedState | { state: 'installable' };
}

/**
 * The accounts a person can connect, as their own token shows them: their personal account,
 * every account the app is installed on that they can see, and the accounts they asked an
 * owner to install it on. A provider may hide accounts without the app; its own install page
 * covers those.
 */
export class ConnectableAccounts {
  private readonly owned: OwnedConnections;
  private readonly flow: ConnectFlow;
  private readonly connections: ConnectionRepository;

  constructor(props: {
    owned: OwnedConnections;
    flow: ConnectFlow;
    connections: ConnectionRepository;
  }) {
    this.owned = props.owned;
    this.flow = props.flow;
    this.connections = props.connections;
  }

  /** Null when the person hasn't authorized the app, or must authorize it again. */
  async list(props: { userId: string }): Promise<ListedAccount[] | null> {
    const grant = await this.owned.userGrant(props);
    if (grant === null) {
      return null;
    }
    try {
      return await this.read({
        userId: props.userId,
        accessToken: grant.accessToken,
      });
    } catch (error) {
      if (error instanceof GrantRevokedError) {
        return null;
      }
      throw error;
    }
  }

  private async read(props: {
    userId: string;
    accessToken: string;
  }): Promise<ListedAccount[]> {
    const provider = this.owned.provider;
    const [listed, owned, requests] = await Promise.all([
      this.flow.listUserAccounts({ accessToken: props.accessToken }),
      this.connections.listOwned({ provider }),
      this.connections.listInstallRequests({ userId: props.userId, provider }),
    ]);
    const connectionIds = new Map(
      owned.map((connection) => [connection.installationId, connection.id]),
    );
    const installed: ListedAccount[] = listed.installations.map(
      (installation) => ({
        account: installation.account,
        install: {
          state: 'installed',
          installationId: installation.externalId,
          repositorySelection: installation.repositorySelection,
          repositoryCount: installation.repositoryCount,
          suspended: installation.suspended,
          settingsUrl: installation.url,
          connectionId: connectionIds.get(installation.externalId) ?? null,
        },
      }),
    );
    const covered = new Set([
      listed.personal.externalId,
      ...listed.installations.map(({ account }) => account.externalId),
    ]);
    const personal: ListedAccount[] = listed.installations.some(
      ({ account }) => account.externalId === listed.personal.externalId,
    )
      ? []
      : [{ account: listed.personal, install: { state: 'installable' } }];
    const requested = await this.requested({
      accessToken: props.accessToken,
      requests: requests.filter(
        ({ accountExternalId }) => !covered.has(accountExternalId),
      ),
    });

    return ConnectableAccounts.ordered([
      ...personal,
      ...installed,
      ...requested,
    ]);
  }

  /** Only a member who isn't an owner is offered a request, so a requested account's role is `member`. Accounts that no longer exist are dropped. */
  private async requested(props: {
    accessToken: string;
    requests: readonly InstallRequest[];
  }): Promise<ListedAccount[]> {
    const entries = await Promise.all(
      props.requests.map(async (request): Promise<ListedAccount | null> => {
        const profile = await this.flow.getAccount({
          accessToken: props.accessToken,
          accountExternalId: request.accountExternalId,
        });
        return profile === null
          ? null
          : {
              account: { ...profile, role: 'member' },
              install: { state: 'requested', requestedAt: request.requestedAt },
            };
      }),
    );
    return entries.filter((entry) => entry !== null);
  }

  /** The personal account first, then installed accounts, then requests, each by login. */
  private static ordered(entries: ListedAccount[]): ListedAccount[] {
    const rank = (entry: ListedAccount) => {
      if (entry.account.role === 'personal') {
        return 0;
      }
      return entry.install.state === 'requested' ? 2 : 1;
    };
    return entries.toSorted(
      (left, right) =>
        rank(left) - rank(right) ||
        left.account.login.localeCompare(right.account.login),
    );
  }
}
