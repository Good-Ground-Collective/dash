import type {
  ConnectedAccount,
  ConnectFlow,
  UserGrant,
} from '@dash/integrations-core';

import type { OwnedConnection } from '#src/connections/contracts/connections.ts';
import {
  AccountLinkedElsewhereError,
  AccountNotLinkedError,
  InstallationNotYoursError,
  SealedTokenError,
} from '#src/connections/errors.ts';
import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type {
  LinkedAccountRepository,
  StoredLinkedAccount,
} from '#src/connections/repositories/linked-accounts/linked-account-repository.ts';
import type { TokenCipher } from '#src/connections/services/token-cipher/token-cipher.ts';

/** Refresh a little early, so a token doesn't expire mid-request. */
const expirySkewMilliseconds = 60_000;

/**
 * One provider's `owned` connections: links a person to their provider account, records the
 * installations they can manage, and keeps their token fresh for later reads (#74).
 */
export class OwnedConnections {
  readonly provider: string;
  private readonly flow: ConnectFlow;
  private readonly connections: ConnectionRepository;
  private readonly linkedAccounts: LinkedAccountRepository;
  private readonly cipher: TokenCipher;
  private readonly now: () => Date;

  constructor(props: {
    provider: string;
    flow: ConnectFlow;
    connections: ConnectionRepository;
    linkedAccounts: LinkedAccountRepository;
    cipher: TokenCipher;
    now?: (() => Date) | undefined;
  }) {
    this.provider = props.provider;
    this.flow = props.flow;
    this.connections = props.connections;
    this.linkedAccounts = props.linkedAccounts;
    this.cipher = props.cipher;
    this.now = props.now ?? (() => new Date());
  }

  /** Exchanges the authorization code and links the provider account to `userId`. */
  async link(props: {
    userId: string;
    code: string;
    redirectUrl: string;
  }): Promise<ConnectedAccount> {
    const { account, grant } = await this.flow.authorizeUser(props);
    const owner = await this.linkedAccounts.findOwner({
      provider: this.provider,
      externalId: account.externalId,
    });
    if (owner !== null && owner !== props.userId) {
      throw new AccountLinkedElsewhereError({ login: account.login });
    }
    await this.save({ userId: props.userId, account, grant });
    return account;
  }

  async linkedAccount(props: {
    userId: string;
  }): Promise<ConnectedAccount | null> {
    const linked = await this.linkedAccounts.find({
      userId: props.userId,
      provider: this.provider,
    });
    return linked?.account ?? null;
  }

  /** The person's token, refreshed first when it has expired. Null when they haven't linked an account or must authorize again. */
  async userGrant(props: { userId: string }): Promise<UserGrant | null> {
    const linked = await this.linkedAccounts.find({
      userId: props.userId,
      provider: this.provider,
    });
    if (linked === null) {
      return null;
    }

    const grant = this.open(linked);
    if (grant === null) {
      return null;
    }
    if (!this.expired(grant.accessTokenExpiresAt)) {
      return grant;
    }
    if (
      grant.refreshToken === null ||
      this.expired(grant.refreshTokenExpiresAt)
    ) {
      return null;
    }
    const refreshed = await this.flow.refreshGrant({
      refreshToken: grant.refreshToken,
    });
    await this.save({
      userId: props.userId,
      account: linked.account,
      grant: refreshed,
    });
    return refreshed;
  }

  /**
   * Records an installation as an `owned` connection, after checking that the person's own
   * token can see it, so a forged callback can't attach someone else's installation.
   */
  async recordInstallation(props: {
    userId: string;
    installationId: string;
  }): Promise<OwnedConnection> {
    const grant = await this.userGrant({ userId: props.userId });
    if (grant === null) {
      throw new AccountNotLinkedError({ provider: this.provider });
    }
    const theirs = await this.flow.listUserInstallationIds({
      accessToken: grant.accessToken,
    });
    if (!theirs.includes(props.installationId)) {
      throw new InstallationNotYoursError({
        installationId: props.installationId,
      });
    }

    const installation = await this.flow.getInstallation({
      installationId: props.installationId,
    });
    return this.connections.saveOwned({
      provider: this.provider,
      connectedBy: props.userId,
      installation,
    });
  }

  async recordInstallRequest(props: {
    userId: string;
    accountExternalId: string;
  }): Promise<void> {
    await this.connections.recordInstallRequest({
      ...props,
      provider: this.provider,
    });
  }

  async list(): Promise<OwnedConnection[]> {
    return this.connections.listOwned({ provider: this.provider });
  }

  private async save(props: {
    userId: string;
    account: ConnectedAccount;
    grant: UserGrant;
  }): Promise<void> {
    const { userId, account, grant } = props;
    await this.linkedAccounts.save({
      userId,
      account,
      sealedAccessToken: this.cipher.seal({
        plaintext: grant.accessToken,
        context: this.context({ userId, column: 'access' }),
      }),
      accessTokenExpiresAt: grant.accessTokenExpiresAt,
      sealedRefreshToken:
        grant.refreshToken === null
          ? null
          : this.cipher.seal({
              plaintext: grant.refreshToken,
              context: this.context({ userId, column: 'refresh' }),
            }),
      refreshTokenExpiresAt: grant.refreshTokenExpiresAt,
    });
  }

  /** Null when the tokens no longer open, as after the auth secret rotates: the person authorizes again. */
  private open(linked: StoredLinkedAccount): UserGrant | null {
    const { userId } = linked;
    try {
      return this.openGrant({ linked, userId });
    } catch (error) {
      if (error instanceof SealedTokenError) {
        return null;
      }
      throw error;
    }
  }

  private openGrant(props: {
    linked: StoredLinkedAccount;
    userId: string;
  }): UserGrant {
    const { linked, userId } = props;
    return {
      accessToken: this.cipher.open({
        sealed: linked.sealedAccessToken,
        context: this.context({ userId, column: 'access' }),
      }),
      accessTokenExpiresAt: linked.accessTokenExpiresAt,
      refreshToken:
        linked.sealedRefreshToken === null
          ? null
          : this.cipher.open({
              sealed: linked.sealedRefreshToken,
              context: this.context({ userId, column: 'refresh' }),
            }),
      refreshTokenExpiresAt: linked.refreshTokenExpiresAt,
    };
  }

  private context(props: {
    userId: string;
    column: 'access' | 'refresh';
  }): string {
    return `${props.userId}:${this.provider}:${props.column}`;
  }

  private expired(expiresAt: string | null): boolean {
    return (
      expiresAt !== null &&
      new Date(expiresAt).getTime() - expirySkewMilliseconds <=
        this.now().getTime()
    );
  }
}
