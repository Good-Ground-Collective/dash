import type {
  AccountProfile,
  AuthorizedUser,
  ConnectFlow,
  Installation,
  UserAccounts,
  UserGrant,
  WebhookDelivery,
  WebhookHeaders,
} from '@dash/integrations-core';
import { request as octokitRequest } from '@octokit/request';

import { githubAppConfigSchema } from '#src/contracts/github-app-config.ts';
import type { GithubAppConfig } from '#src/contracts/github-app-config.ts';
import { GithubInstallations } from '#src/services/github-installations/github-installations.ts';
import { GithubUserAccounts } from '#src/services/github-user-accounts/github-user-accounts.ts';
import { GithubUserAuth } from '#src/services/github-user-auth/github-user-auth.ts';
import { GithubWebhooks } from '#src/services/github-webhooks/github-webhooks.ts';

/** The GitHub App's install-and-authorize flow, over the App's installations, OAuth and webhooks. */
export class GithubConnectFlow implements ConnectFlow {
  private readonly installations: GithubInstallations;
  private readonly users: GithubUserAuth;
  private readonly accounts: GithubUserAccounts;
  private readonly webhooks: GithubWebhooks;

  constructor(props: { config: GithubAppConfig }) {
    const config = githubAppConfigSchema.parse(props.config);
    const request = octokitRequest.defaults({
      headers: { 'user-agent': 'dash-mission-control' },
    });
    this.installations = new GithubInstallations({
      appId: config.appId,
      slug: config.slug,
      privateKey: config.privateKey,
      request,
    });
    this.users = new GithubUserAuth({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      request,
    });
    this.accounts = new GithubUserAccounts({
      request,
      installations: this.installations,
    });
    this.webhooks = new GithubWebhooks({ secret: config.webhookSecret });
  }

  installUrl(props: { state: string; targetAccountId?: string }): string {
    return this.installations.installUrl(props);
  }

  authorizeUrl(props: { state: string; redirectUrl: string }): string {
    return this.users.authorizeUrl(props);
  }

  async authorizeUser(props: {
    code: string;
    redirectUrl: string;
  }): Promise<AuthorizedUser> {
    return this.users.authorizeUser(props);
  }

  async refreshGrant(props: { refreshToken: string }): Promise<UserGrant> {
    return this.users.refreshGrant(props);
  }

  async listUserInstallationIds(props: {
    accessToken: string;
  }): Promise<readonly string[]> {
    return this.accounts.listInstallationIds(props);
  }

  async listUserAccounts(props: {
    accessToken: string;
  }): Promise<UserAccounts> {
    return this.accounts.list(props);
  }

  async getAccount(props: {
    accessToken: string;
    accountExternalId: string;
  }): Promise<AccountProfile | null> {
    return this.accounts.get(props);
  }

  async getInstallation(props: {
    installationId: string;
  }): Promise<Installation> {
    return this.installations.get(props);
  }

  async verifyWebhook(props: {
    headers: WebhookHeaders;
    body: Uint8Array;
  }): Promise<WebhookDelivery | null> {
    return this.webhooks.verify(props);
  }
}
