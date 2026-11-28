import type { ConnectFlow } from '@dash/integrations-core';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import {
  accountsResponseSchema,
  type ConnectableAccount,
  connectQuerySchema,
  organizationLookupQuerySchema,
  organizationLookupResponseSchema,
} from '#src/connections/contracts/connections.ts';
import { SignInRequiredError } from '#src/connections/errors.ts';
import type {
  ConnectableAccounts,
  ListedAccount,
} from '#src/connections/services/connectable-accounts/connectable-accounts.ts';
import type { ConnectPaths } from '#src/connections/services/connect-paths/connect-paths.ts';
import type { OrganizationLookup } from '#src/connections/services/organization-lookup/organization-lookup.ts';
import type {
  ConnectState,
  ConnectStateRequest,
} from '#src/connections/services/connect-state/connect-state.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

type AccountsResponse = z.input<typeof accountsResponseSchema>;
type LookupResponse = z.input<typeof organizationLookupResponseSchema>;

/**
 * `GET /integrations/<provider>/accounts`: the accounts a signed-in person can connect and
 * where each install stands, read with their own token. When Dash has no usable grant for
 * them it answers `status: authorize` with the authorize URL instead. The provider may hide
 * accounts without the app, so `addAccountUrl` opens its own picker for the rest, and
 * `GET /accounts/lookup?login=` finds an organisation the person names, with a link that asks
 * its owners to install the app.
 */
export class AccountsRoutes {
  private readonly accounts: ConnectableAccounts;
  private readonly lookup: OrganizationLookup;
  private readonly flow: ConnectFlow;
  private readonly person: SignedInPerson;
  private readonly state: ConnectState;
  private readonly paths: ConnectPaths;

  constructor(props: {
    accounts: ConnectableAccounts;
    lookup: OrganizationLookup;
    flow: ConnectFlow;
    identity: Pick<Identity, 'session'>;
    state: ConnectState;
    paths: ConnectPaths;
  }) {
    this.accounts = props.accounts;
    this.lookup = props.lookup;
    this.flow = props.flow;
    this.person = new SignedInPerson({ identity: props.identity });
    this.state = props.state;
    this.paths = props.paths;
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      `${this.paths.prefix}/accounts`,
      {
        schema: {
          querystring: connectQuerySchema,
          response: { 200: accountsResponseSchema },
        },
      },
      async (request) =>
        this.respond({
          userId: await this.signedIn(request),
          provider: this.paths.provider,
          returnTo: request.query.returnTo ?? this.paths.defaultReturnTo,
        }),
    );

    app.get(
      `${this.paths.prefix}/accounts/lookup`,
      {
        schema: {
          querystring: organizationLookupQuerySchema,
          response: { 200: organizationLookupResponseSchema },
        },
      },
      async (request) =>
        this.respondToLookup({
          base: {
            userId: await this.signedIn(request),
            provider: this.paths.provider,
            returnTo: request.query.returnTo ?? this.paths.defaultReturnTo,
          },
          login: request.query.login,
        }),
    );
  }

  private async signedIn(request: FastifyRequest): Promise<string> {
    const userId = await this.person.of(request);
    if (userId === null) {
      throw new SignInRequiredError();
    }
    return userId;
  }

  private async respond(base: ConnectStateRequest): Promise<AccountsResponse> {
    const listed = await this.accounts.list({ userId: base.userId });
    if (listed === null) {
      return this.authorize(base);
    }

    return {
      status: 'linked',
      addAccountUrl: this.flow.installUrl({ state: this.state.issue(base) }),
      accounts: listed.accounts.map((entry) => this.withLinks({ entry, base })),
      suggestions: listed.suggestions,
    };
  }

  private async respondToLookup(props: {
    base: ConnectStateRequest;
    login: string;
  }): Promise<LookupResponse> {
    const { base } = props;
    const result = await this.lookup.find({
      userId: base.userId,
      login: props.login,
    });
    if (result === null) {
      return this.authorize(base);
    }
    return result.found
      ? {
          status: 'found',
          entry: this.withLinks({ entry: result.entry, base }),
        }
      : { status: 'missing' };
  }

  private authorize(base: ConnectStateRequest) {
    return {
      status: 'authorize' as const,
      authorizeUrl: this.flow.authorizeUrl({
        state: this.state.issue(base),
        redirectUrl: this.paths.callbackUrl,
      }),
    };
  }

  /**
   * An installable or requestable account's link opens the provider's install page with that
   * account chosen. Its state names the account, so the setup callback can record a request
   * for it: the provider's request redirect doesn't say which account it was for.
   */
  private withLinks(props: {
    entry: ListedAccount;
    base: ConnectStateRequest;
  }): ConnectableAccount {
    const { account, install } = props.entry;
    if (install.state !== 'installable' && install.state !== 'requestable') {
      return { account, install };
    }
    return {
      account,
      install: {
        state: install.state,
        installUrl: this.flow.installUrl({
          state: this.state.issue({
            ...props.base,
            targetAccountId: account.externalId,
          }),
          targetAccountId: account.externalId,
        }),
      },
    };
  }
}
