import type {
  AuthorizedUser,
  ConnectFlow,
  Installation,
  UserGrant,
  WebhookDelivery,
  WebhookHeaders,
} from '@dash/integrations-core';

export const providerHost = 'https://forge.test';

export const octocatAccount = {
  provider: 'github',
  externalId: '583231',
  url: 'https://github.com/octocat',
  login: 'octocat',
  kind: 'user',
} as const;

export const acmeInstallation: Installation = {
  provider: 'github',
  externalId: '42',
  url: 'https://github.com/organizations/acme/settings/installations/42',
  account: {
    provider: 'github',
    externalId: '9919',
    url: 'https://github.com/acme',
    login: 'acme',
    kind: 'organization',
  },
  repositorySelection: 'selected',
  repositories: [
    {
      provider: 'github',
      externalId: '1296269',
      url: 'https://github.com/acme/app',
      fullName: 'acme/app',
      defaultBranch: 'main',
      archived: false,
    },
  ],
  suspended: false,
};

/**
 * A provider in memory. Code `good` authorizes octocat with `access-1`, which can manage
 * installation 42. A webhook is authentic when `x-signature` is `signed:<body>`.
 */
export class FakeConnectFlow implements ConnectFlow {
  readonly refreshed: string[] = [];
  grant: UserGrant = {
    accessToken: 'access-1',
    accessTokenExpiresAt: '2026-11-26T20:00:00.000Z',
    refreshToken: 'refresh-1',
    refreshTokenExpiresAt: '2027-05-26T12:00:00.000Z',
  };
  refreshedGrant: UserGrant = {
    accessToken: 'access-2',
    accessTokenExpiresAt: '2026-11-27T20:00:00.000Z',
    refreshToken: 'refresh-2',
    refreshTokenExpiresAt: '2027-05-27T12:00:00.000Z',
  };
  readonly manageable = new Map<string, readonly string[]>([
    ['access-1', ['42']],
    ['access-2', ['42']],
  ]);

  installUrl(props: { state: string; targetAccountId?: string }): string {
    const url = new URL('/install', providerHost);
    url.searchParams.set('state', props.state);
    if (props.targetAccountId !== undefined) {
      url.searchParams.set('target_id', props.targetAccountId);
    }
    return url.toString();
  }

  authorizeUrl(props: { state: string; redirectUrl: string }): string {
    const url = new URL('/authorize', providerHost);
    url.searchParams.set('state', props.state);
    url.searchParams.set('redirect_uri', props.redirectUrl);
    return url.toString();
  }

  async authorizeUser(props: { code: string }): Promise<AuthorizedUser> {
    if (props.code !== 'good') {
      throw new Error('bad_verification_code');
    }
    return { account: octocatAccount, grant: this.grant };
  }

  async refreshGrant(props: { refreshToken: string }): Promise<UserGrant> {
    this.refreshed.push(props.refreshToken);
    return this.refreshedGrant;
  }

  async listUserInstallationIds(props: {
    accessToken: string;
  }): Promise<readonly string[]> {
    return this.manageable.get(props.accessToken) ?? [];
  }

  async getInstallation(props: {
    installationId: string;
  }): Promise<Installation> {
    return { ...acmeInstallation, externalId: props.installationId };
  }

  async verifyWebhook(props: {
    headers: WebhookHeaders;
    body: string;
  }): Promise<WebhookDelivery | null> {
    const delivery = props.headers['x-delivery'];
    if (
      props.headers['x-signature'] !== `signed:${props.body}` ||
      delivery === undefined ||
      Array.isArray(delivery)
    ) {
      return null;
    }
    return {
      deliveryId: String(delivery),
      event: 'installation',
      installationId: '42',
    };
  }
}
