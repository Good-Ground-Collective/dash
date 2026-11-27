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
import type {
  ConnectState,
  ConnectStateRequest,
} from '#src/connections/services/connect-state/connect-state.ts';
import { SignedInPerson } from '#src/connections/services/signed-in-person/signed-in-person.ts';
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
  private readonly provider: string;
  private readonly redirectUrl: string;

  constructor(props: {
    provider: string;
    accounts: ConnectableAccounts;
    flow: ConnectFlow;
    identity: Pick<Identity, 'session'>;
    state: ConnectState;
    /** Mission Control's public origin, where the provider sends people back. */
    baseUrl: string;
  }) {
    this.provider = props.provider;
    this.accounts = props.accounts;
    this.flow = props.flow;
    this.person = new SignedInPerson({ identity: props.identity });
    this.state = props.state;
    this.redirectUrl = `${props.baseUrl}/integrations/${props.provider}/callback`;
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      `/integrations/${this.provider}/accounts`,
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
          provider: this.provider,
          returnTo: request.query.returnTo ?? `/setup/${this.provider}`,
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
          redirectUrl: this.redirectUrl,
        }),
      };
    }
    return {
      status: 'linked',
      addAccountUrl: this.flow.installUrl({ state: this.state.issue(base) }),
      accounts: listed.map((entry) => this.withLinks({ entry, base })),
    };
  }

  /** An installable account's link preselects it, and its state names it so a `request` callback records the right account. */
  private withLinks(props: {
    entry: ListedAccount;
    base: ConnectStateRequest;
  }): ConnectableAccount {
    const { account, install } = props.entry;
    if (install.state !== 'installable') {
      return { account, install };
    }
    const targetAccountId = account.externalId;
    return {
      account,
      install: {
        state: 'installable',
        installUrl: this.flow.installUrl({
          state: this.state.issue({ ...props.base, targetAccountId }),
          targetAccountId,
        }),
      },
    };
  }
}
