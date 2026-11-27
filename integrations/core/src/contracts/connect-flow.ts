import type {
  AccountProfile,
  AuthorizedUser,
  Installation,
  UserAccounts,
  UserGrant,
  WebhookDelivery,
  WebhookHeaders,
} from '#src/contracts/connect-flow-records.ts';

/**
 * How a person connects a provider they own: install the provider's app on their accounts
 * and authorize it to act as them. Mission Control records the result as `owned`
 * connections. Offered only when the provider's app is configured.
 */
export interface ConnectFlow {
  /** Where to send a person to install the app. The provider hands `state` back to the setup callback. `targetAccountId` preselects an account. */
  installUrl(props: { state: string; targetAccountId?: string }): string;
  /** Where to send a person to authorize the app. The provider returns them to `redirectUrl` with a code and `state`. */
  authorizeUrl(props: { state: string; redirectUrl: string }): string;
  /** Exchanges the authorization code for the person's account and token. */
  authorizeUser(props: {
    code: string;
    redirectUrl: string;
  }): Promise<AuthorizedUser>;
  /** A fresh grant for an expired one. Throws `GrantRevokedError` when the provider refuses the refresh token. */
  refreshGrant(props: { refreshToken: string }): Promise<UserGrant>;
  /** The installations the person behind `accessToken` may manage, so a callback can't claim someone else's. Throws `GrantRevokedError` when the provider refuses the token. */
  listUserInstallationIds(props: {
    accessToken: string;
  }): Promise<readonly string[]>;
  /** The person's own account and every installation of the app their token can see, with their role in each. Throws `GrantRevokedError` when the provider refuses the token. */
  listUserAccounts(props: { accessToken: string }): Promise<UserAccounts>;
  /** One account by its id, read as the person, or null when it no longer exists. Throws `GrantRevokedError` when the provider refuses the token. */
  getAccount(props: {
    accessToken: string;
    accountExternalId: string;
  }): Promise<AccountProfile | null>;
  /** Reads one installation as the app: its account and the repositories it covers. */
  getInstallation(props: { installationId: string }): Promise<Installation>;
  /** The delivery when its signature matches the webhook secret over the exact body bytes, otherwise null. The body is parsed only after the signature checks out. */
  verifyWebhook(props: {
    headers: WebhookHeaders;
    body: Uint8Array;
  }): Promise<WebhookDelivery | null>;
}
