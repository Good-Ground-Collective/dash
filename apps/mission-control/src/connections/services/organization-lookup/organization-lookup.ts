import type { ConnectFlow } from '@dash/integrations-core';
import { z } from 'zod';

import type { InstallRequestRepository } from '#src/connections/repositories/install-requests/install-request-repository.ts';
import type { ListedAccount } from '#src/connections/services/connectable-accounts/connectable-accounts.ts';
import type { OwnedConnections } from '#src/connections/services/owned-connections/owned-connections.ts';
import { RequestedAccounts } from '#src/connections/services/requested-accounts/requested-accounts.ts';

/** What looking an organisation up found. A found one is `requestable`, or `requested` when the person already asked. */
export type OrganizationLookupResult =
  { found: true; entry: ListedAccount } | { found: false };

const organizationLookupPropsSchema = z.object({
  owned: z.custom<OwnedConnections>(),
  flow: z.custom<ConnectFlow>(),
  requests: z.custom<InstallRequestRepository>(),
});

/**
 * Finds an organisation the person names, so they can ask its owners to install the app. A
 * provider's app may not list the organisations a person belongs to where it isn't installed,
 * so naming one is how it gets an install link. The role stays null until the app is installed.
 */
export class OrganizationLookup {
  private readonly owned: OwnedConnections;
  private readonly flow: ConnectFlow;
  private readonly requested: RequestedAccounts;

  constructor(props: z.input<typeof organizationLookupPropsSchema>) {
    const valid = organizationLookupPropsSchema.parse(props);
    this.owned = valid.owned;
    this.flow = valid.flow;
    this.requested = new RequestedAccounts({
      provider: valid.owned.provider,
      flow: valid.flow,
      requests: valid.requests,
    });
  }

  /** Null when the person hasn't authorized the app, or must authorize it again. */
  async find(props: {
    userId: string;
    login: string;
  }): Promise<OrganizationLookupResult | null> {
    return this.owned.readAsPerson({
      userId: props.userId,
      read: async (accessToken) => {
        const account = await this.flow.findOrganization({
          accessToken,
          login: props.login,
        });
        if (account === null) {
          return { found: false };
        }

        const request = await this.requested.find({
          userId: props.userId,
          accountExternalId: account.externalId,
        });
        const entry: ListedAccount =
          request === null
            ? {
                account: { ...account, role: null },
                install: { state: 'requestable' },
              }
            : RequestedAccounts.entry({ account, request });
        return { found: true, entry };
      },
    });
  }
}
