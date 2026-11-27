import type { ConnectFlow } from '@dash/integrations-core';
import type { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import {
  accountsResponseSchema,
  type ConnectableAccount,
  connectQuerySchema,
} from '#src/connections/contracts/connections.ts';
import { SignInRequiredError } from '#src/connections/errors.ts';
import type {
  ConnectableAccounts,
  ListedAccount,
} from '#src/connections/services/connectable-accounts/connectable-accounts.ts';
import type { ConnectPaths } from '#src/connections/services/connect-paths/connect-paths.ts';
import type {
  ConnectState,
  ConnectStateRequest,
} from '#src/connections/services/connect-state/connect-state.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

type AccountsResponse = z.input<typeof accountsResponseSchema>;

/**
 * `GET /integrations/<provider>/accounts`: the accounts a signed-in person can connect and
 * where each install stands, read with their own token. When Dash has no usable grant for
 * them it answers `status: authorize` with the authorize URL instead. The provider may hide
 * accounts without the app, so `addAccountUrl` opens its own picker for the rest.
 */
export class AccountsRoutes {
  private readonly accounts: ConnectableAccounts;
  private readonly flow: ConnectFlow;
  private readonly person: SignedInPerson;
  private readonly state: ConnectState;
  private readonly paths: ConnectPaths;

  constructor(props: {
    accounts: ConnectableAccounts;
    flow: ConnectFlow;
    identity: Pick<Identity, 'session'>;
    state: ConnectState;
    paths: ConnectPaths;
  }) {
    this.accounts = props.accounts;
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
      async (request) => {
        const userId = await this.person.of(request);
        if (userId === null) {
          throw new SignInRequiredError();
        }
        return this.respond({
          userId,
          provider: this.paths.provider,
          returnTo: request.query.returnTo ?? this.paths.defaultReturnTo,
        });
      },
    );
  }

  private async respond(base: ConnectStateRequest): Promise<AccountsResponse> {
    const listed = await this.accounts.list({ userId: base.userId });
    if (listed === null) {
      return {
        status: 'authorize',
        authorizeUrl: this.flow.authorizeUrl({
          state: this.state.issue(base),
          redirectUrl: this.paths.callbackUrl,
        }),
      };
    }

    return {
      status: 'linked',
      addAccountUrl: this.flow.installUrl({ state: this.state.issue(base) }),
      accounts: listed.map((entry) => this.withLinks({ entry, base })),
    };
  }

  /** An installable account's link opens the provider's install page with that account chosen. */
  private withLinks(props: {
    entry: ListedAccount;
    base: ConnectStateRequest;
  }): ConnectableAccount {
    const { account, install } = props.entry;
    if (install.state !== 'installable') {
      return { account, install };
    }
    return {
      account,
      install: {
        state: 'installable',
        installUrl: this.flow.installUrl({
          state: this.state.issue(props.base),
          targetAccountId: account.externalId,
        }),
      },
    };
  }
}
