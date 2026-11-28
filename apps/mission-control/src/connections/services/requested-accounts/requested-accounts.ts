import {
  type AccountProfile,
  type ConnectFlow,
  GrantRevokedError,
  type UserAccounts,
} from '@dash/integrations-core';
import { z } from 'zod';

import type { RequestedState } from '#src/connections/contracts/connections.ts';
import type {
  InstallRequest,
  InstallRequestRepository,
} from '#src/connections/repositories/install-requests/install-request-repository.ts';

/** A requested account as the list shows it. The role is null: the provider says it only once the app is installed. */
export interface RequestedAccount {
  account: AccountProfile & { role: null };
  install: RequestedState;
}

/** Where a request stands once the provider has been asked about its account. */
type RequestReading =
  | { kind: 'pending'; entry: RequestedAccount }
  | { kind: 'settled' }
  | { kind: 'unread' };

const requestedAccountsPropsSchema = z.object({
  provider: z.string().min(1),
  flow: z.custom<ConnectFlow>(),
  requests: z.custom<InstallRequestRepository>(),
});

/**
 * The organisations a person asked to install the app through a link from Dash. A request
 * ends once the installation appears to the person, or the account no longer exists.
 */
export class RequestedAccounts {
  private readonly provider: string;
  private readonly flow: ConnectFlow;
  private readonly requests: InstallRequestRepository;

  constructor(props: z.input<typeof requestedAccountsPropsSchema>) {
    const valid = requestedAccountsPropsSchema.parse(props);
    this.provider = valid.provider;
    this.flow = valid.flow;
    this.requests = valid.requests;
  }

  /** The open requests, read as the person. One whose account fails to load is left out this time and kept. */
  async list(props: {
    userId: string;
    accessToken: string;
    listed: UserAccounts;
  }): Promise<RequestedAccount[]> {
    const installed = new Set(
      props.listed.installations.map(({ account }) => account.externalId),
    );
    const requests = await this.requests.list({
      userId: props.userId,
      provider: this.provider,
    });

    const readings = await Promise.all(
      requests.map(async (request) =>
        installed.has(request.accountExternalId)
          ? { request, reading: { kind: 'settled' } as const }
          : { request, reading: await this.read({ ...props, request }) },
      ),
    );

    await this.requests.clear({
      userId: props.userId,
      provider: this.provider,
      accountExternalIds: readings
        .filter(({ reading }) => reading.kind === 'settled')
        .map(({ request }) => request.accountExternalId),
    });
    return readings.flatMap(({ reading }) =>
      reading.kind === 'pending' ? [reading.entry] : [],
    );
  }

  /** The person's open request for this account, if they have one. */
  async find(props: {
    userId: string;
    accountExternalId: string;
  }): Promise<InstallRequest | null> {
    const requests = await this.requests.list({
      userId: props.userId,
      provider: this.provider,
    });
    return (
      requests.find(
        ({ accountExternalId }) =>
          accountExternalId === props.accountExternalId,
      ) ?? null
    );
  }

  private async read(props: {
    accessToken: string;
    request: InstallRequest;
  }): Promise<RequestReading> {
    try {
      const account = await this.flow.getAccount({
        accessToken: props.accessToken,
        externalId: props.request.accountExternalId,
      });
      return account === null
        ? { kind: 'settled' }
        : {
            kind: 'pending',
            entry: RequestedAccounts.entry({
              account,
              request: props.request,
            }),
          };
    } catch (error) {
      if (error instanceof GrantRevokedError) {
        throw error;
      }
      return { kind: 'unread' };
    }
  }

  static entry(props: {
    account: AccountProfile;
    request: InstallRequest;
  }): RequestedAccount {
    return {
      account: { ...props.account, role: null },
      install: { state: 'requested', requestedAt: props.request.requestedAt },
    };
  }
}
