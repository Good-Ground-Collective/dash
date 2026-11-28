import {
  type ConnectFlow,
  GrantRevokedError,
  type UserAccount,
  type UserAccounts,
} from '@dash/integrations-core';
import { z } from 'zod';

import type {
  InstalledState,
  OrganizationSuggestion,
  RequestedState,
} from '#src/connections/contracts/connections.ts';
import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type { InstallRequestRepository } from '#src/connections/repositories/install-requests/install-request-repository.ts';
import type { OwnedConnections } from '#src/connections/services/owned-connections/owned-connections.ts';
import { RequestedAccounts } from '#src/connections/services/requested-accounts/requested-accounts.ts';

/** An entry before the routes add the links, which need a state issued per request. */
export interface ListedAccount {
  account: UserAccount;
  install:
    | InstalledState
    | RequestedState
    | { state: 'installable' }
    | { state: 'requestable' };
}

/** What the person's token shows, and the organisations to suggest they look up. */
export interface AccountListing {
  accounts: ListedAccount[];
  suggestions: OrganizationSuggestion[];
}

const connectableAccountsPropsSchema = z.object({
  owned: z.custom<OwnedConnections>(),
  flow: z.custom<ConnectFlow>(),
  connections: z.custom<ConnectionRepository>(),
  requests: z.custom<InstallRequestRepository>(),
});

/**
 * The accounts a person can connect, as their own token shows them: their personal account,
 * every account the app is installed on that they can see, and the organisations they asked
 * to install it. A provider may hide accounts without the app, so organisations where the
 * person's membership is public come back as suggestions to look up.
 */
export class ConnectableAccounts {
  private readonly owned: OwnedConnections;
  private readonly flow: ConnectFlow;
  private readonly connections: ConnectionRepository;
  private readonly requested: RequestedAccounts;

  constructor(props: z.input<typeof connectableAccountsPropsSchema>) {
    const valid = connectableAccountsPropsSchema.parse(props);
    this.owned = valid.owned;
    this.flow = valid.flow;
    this.connections = valid.connections;
    this.requested = new RequestedAccounts({
      provider: valid.owned.provider,
      flow: valid.flow,
      requests: valid.requests,
    });
  }

  /** Null when the person hasn't authorized the app, or must authorize it again. */
  async list(props: { userId: string }): Promise<AccountListing | null> {
    return this.owned.readAsPerson({
      userId: props.userId,
      read: async (accessToken) =>
        this.read({ userId: props.userId, accessToken }),
    });
  }

  private async read(props: {
    userId: string;
    accessToken: string;
  }): Promise<AccountListing> {
    const listed = await this.flow.listUserAccounts(props);
    const [installed, requested] = await Promise.all([
      this.installed(listed),
      this.requested.list({ ...props, listed }),
    ]);

    const accounts = ConnectableAccounts.ordered([
      ...ConnectableAccounts.personalToInstall(listed),
      ...installed,
      ...requested,
    ]);
    const suggestions = await this.suggestions({
      accessToken: props.accessToken,
      login: listed.personal.login,
      shown: accounts,
    });
    return { accounts, suggestions };
  }

  private async installed(listed: UserAccounts): Promise<ListedAccount[]> {
    const connectionIds = await this.connections.connectionIdsFor({
      provider: this.owned.provider,
      installationIds: listed.installations.map(({ externalId }) => externalId),
    });

    return listed.installations.map((installation) => ({
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
    }));
  }

  /** Suggestions are a convenience: when the provider fails to give them, there are none. A refused grant still ends the listing. */
  private async suggestions(props: {
    accessToken: string;
    login: string;
    shown: readonly ListedAccount[];
  }): Promise<OrganizationSuggestion[]> {
    const shown = new Set(props.shown.map(({ account }) => account.externalId));
    try {
      const organizations = await this.flow.listPublicOrganizations(props);
      return organizations
        .filter(({ externalId }) => !shown.has(externalId))
        .map(({ login, avatarUrl }) => ({ login, avatarUrl }))
        .toSorted((left, right) => left.login.localeCompare(right.login));
    } catch (error) {
      if (error instanceof GrantRevokedError) {
        throw error;
      }
      return [];
    }
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
