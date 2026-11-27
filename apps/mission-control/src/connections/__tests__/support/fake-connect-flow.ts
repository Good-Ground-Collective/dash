import {
  type AccountProfile,
  type AuthorizedUser,
  type ConnectFlow,
  GrantRevokedError,
  type Installation,
  type InstallationChange,
  type UserAccounts,
  type UserGrant,
  type UserInstallation,
  type WebhookDelivery,
  type WebhookHeaders,
  webhookPayloadSchema,
} from '@dash/integrations-core';
import { z } from 'zod';

export const providerHost = 'https://forge.test';

const deliveryBodySchema = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: 'custom', message: 'Expected a JSON body' });
      return z.NEVER;
    }
  })
  .pipe(webhookPayloadSchema);

const deliveryFieldsSchema = z.object({
  action: z.string().optional(),
  installation: z.object({ id: z.number() }),
});

const installationChanges: ReadonlyMap<string, InstallationChange> = new Map([
  ['installation.deleted', 'removed'],
  ['installation.suspend', 'suspended'],
  ['installation.unsuspend', 'unsuspended'],
  ['installation_repositories.added', 'repositoriesChanged'],
  ['installation_repositories.removed', 'repositoriesChanged'],
]);

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

export const octocatProfile: AccountProfile = {
  ...octocatAccount,
  avatarUrl: 'https://avatars.forge.test/u/583231',
};

export const acmeUserInstallation: UserInstallation = {
  provider: 'github',
  externalId: '42',
  url: acmeInstallation.url,
  account: {
    ...acmeInstallation.account,
    avatarUrl: 'https://avatars.forge.test/u/9919',
    role: 'owner',
  },
  repositorySelection: 'selected',
  repositoryCount: 1,
  suspended: false,
  incomplete: false,
};

/**
 * A provider in memory. Code `good` authorizes octocat with `access-1`, which can manage
 * installation 42. Its token sees octocat and the `visible` installations. Tokens in `revoked` are refused, and so is every refresh once
 * `refusesRefresh` is set. A webhook is authentic when `x-signature` is `signed:<body>`, and its event is
 * `x-event`: `installation` (the default) or `pull_request`. Its
 * installation is the body's `installation.id`, read only after the signature checks out.
 * Installations in `suspendedInstallations` read as suspended, and the next `unavailableReads`
 * installation reads fail as a provider outage would.
 */
export class FakeConnectFlow implements ConnectFlow {
  readonly refreshed: string[] = [];
  readonly revoked = new Set<string>();
  refusesRefresh = false;
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
  visible: UserInstallation[] = [acmeUserInstallation];
  readonly suspendedInstallations = new Set<string>();
  unavailableReads = 0;
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
    await Promise.resolve();
    if (this.refusesRefresh) {
      throw new GrantRevokedError({ provider: 'github' });
    }
    return this.refreshedGrant;
  }

  async listUserInstallationIds(props: {
    accessToken: string;
  }): Promise<readonly string[]> {
    if (this.revoked.has(props.accessToken)) {
      throw new GrantRevokedError({ provider: 'github' });
    }
    return this.manageable.get(props.accessToken) ?? [];
  }

  async listUserAccounts(props: {
    accessToken: string;
  }): Promise<UserAccounts> {
    if (this.revoked.has(props.accessToken)) {
      throw new GrantRevokedError({ provider: 'github' });
    }
    return {
      personal: { ...octocatProfile, role: 'personal' },
      installations: this.visible,
    };
  }

  async getInstallation(props: {
    installationId: string;
  }): Promise<Installation> {
    this.failIfUnavailable();
    return {
      ...acmeInstallation,
      externalId: props.installationId,
      suspended: this.suspendedInstallations.has(props.installationId),
    };
  }

  async isInstallationSuspended(props: {
    installationId: string;
  }): Promise<boolean> {
    this.failIfUnavailable();
    return this.suspendedInstallations.has(props.installationId);
  }

  async verifyWebhook(props: {
    headers: WebhookHeaders;
    body: Uint8Array;
  }): Promise<WebhookDelivery | null> {
    const text = Buffer.from(props.body).toString('utf8');
    const delivery = props.headers['x-delivery'];
    const event = z
      .string()
      .min(1)
      .catch('installation')
      .parse(props.headers['x-event']);
    if (
      props.headers['x-signature'] !== `signed:${text}` ||
      delivery === undefined ||
      Array.isArray(delivery)
    ) {
      return null;
    }
    const body = deliveryBodySchema.safeParse(text);
    const fields = deliveryFieldsSchema.safeParse(body.data);
    const action = fields.success ? (fields.data.action ?? null) : null;
    return {
      deliveryId: String(delivery),
      event,
      action,
      installationId: fields.success
        ? String(fields.data.installation.id)
        : null,
      installationLifecycle: event.startsWith('installation'),
      installationChange:
        installationChanges.get(`${event}.${action ?? ''}`) ?? null,
      payload: body.success ? body.data : null,
    };
  }

  private failIfUnavailable(): void {
    if (this.unavailableReads > 0) {
      this.unavailableReads -= 1;
      throw new Error('The provider is unavailable');
    }
  }
}
