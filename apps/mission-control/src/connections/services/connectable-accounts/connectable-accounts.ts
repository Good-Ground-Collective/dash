import {
  type ConnectFlow,
  GrantRevokedError,
  type UserAccount,
  type UserAccounts,
} from '@dash/integrations-core';

import type { InstalledState } from '#src/connections/contracts/connections.ts';
import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type { OwnedConnections } from '#src/connections/services/owned-connections/owned-connections.ts';

/** An entry before the routes add the links, which need a state issued per request. */
export interface ListedAccount {
  account: UserAccount;
  install: InstalledState | { state: 'installable' };
}

/**
 * The accounts a person can connect, as their own token shows them: their personal account
 * and every account the app is installed on that they can see. A provider may hide accounts
 * without the app; its own install page covers those.
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
      return await this.read({ accessToken: grant.accessToken });
    } catch (error) {
      if (error instanceof GrantRevokedError) {
        return null;
      }
      throw error;
    }
  }

  private async read(props: { accessToken: string }): Promise<ListedAccount[]> {
    const listed = await this.flow.listUserAccounts(props);

    const connectionIds = await this.connections.connectionIdsFor({
      provider: this.owned.provider,
      installationIds: listed.installations.map(({ externalId }) => externalId),
    });

    const installed: ListedAccount[] = listed.installations.map(
      (installation) => ({
        account: installation.account,
        install: {
          state: 'installed',
          installationId: installation.externalId,
          repositorySelection: installation.repositorySelection,
          repositoryCount: installation.repositoryCount,
          suspended: installation.suspended,
          incomplete: installation.incomplete,
          settingsUrl: installation.url,
          connectionId: connectionIds.get(installation.externalId) ?? null,
        },
      }),
    );

    return ConnectableAccounts.ordered([
      ...ConnectableAccounts.personalToInstall(listed),
      ...installed,
    ]);
  }

  /** The personal account, offered for install until the app is installed on it. */
  private static personalToInstall(listed: UserAccounts): ListedAccount[] {
    const installed = listed.installations.some(
      ({ account }) => account.externalId === listed.personal.externalId,
    );
    return installed
      ? []
      : [{ account: listed.personal, install: { state: 'installable' } }];
  }

  /** The personal account first, then the rest by login. */
  private static ordered(entries: ListedAccount[]): ListedAccount[] {
    const rank = (entry: ListedAccount) =>
      entry.account.role === 'personal' ? 0 : 1;
    return entries.toSorted(
      (left, right) =>
        rank(left) - rank(right) ||
        left.account.login.localeCompare(right.account.login),
    );
  }
}
