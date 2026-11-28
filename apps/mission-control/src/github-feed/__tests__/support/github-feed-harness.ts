import {
  activityFeedCapability,
  type Capabilities,
  type Capability,
  CapabilitySet,
  InMemoryIntegrationRegistry,
  type Integration,
} from '@dash/integrations-core';

import type { PrincipalSession } from '#src/auth/services/identity/identity.ts';
import {
  InMemoryConnectionRepository,
  InMemoryLinkedAccountRepository,
} from '#src/connections/__tests__/support/in-memory-connections.ts';
import { InMemoryWebhookEventRegistry } from '#src/connections/services/webhook-event-registry/webhook-event-registry.ts';
import {
  FakeActivityFeed,
  fixedNow,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import { InMemoryGithubRecords } from '#src/github-feed/__tests__/support/in-memory-github-records.ts';
import { InMemorySyncRequestRepository } from '#src/github-feed/__tests__/support/in-memory-sync-requests.ts';
import { InMemoryWatchedChecks } from '#src/github-feed/__tests__/support/in-memory-watched-checks.ts';
import { GithubFeedModule } from '#src/github-feed/module.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

/** Offers the fake activity feed as the `github` provider. */
class FakeIntegration implements Integration {
  readonly id = 'github';
  readonly provider = 'github';
  private readonly capabilities: Capabilities;

  constructor(props: { feed: FakeActivityFeed }) {
    this.capabilities = CapabilitySet.empty().with(
      activityFeedCapability,
      props.feed,
    );
  }

  capability<T extends object>(capability: Capability<T>): T | undefined {
    return this.capabilities.get(capability);
  }
}

/**
 * The GitHub feed module over in-memory rows and a fake provider feed. A `session=<user id>`
 * cookie signs that person in.
 */
export class GithubFeedHarness {
  readonly feed = new FakeActivityFeed();
  readonly records = new InMemoryGithubRecords();
  readonly linkedAccounts = new InMemoryLinkedAccountRepository();
  readonly webhookEvents = new InMemoryWebhookEventRegistry();
  readonly connections = new InMemoryConnectionRepository();
  readonly syncRequests = new InMemorySyncRequestRepository();
  readonly watchedChecks = new InMemoryWatchedChecks();
  readonly module: GithubFeedModule;
  private app: ZodFastifyInstance | undefined;

  constructor() {
    this.module = new GithubFeedModule({
      registry: new InMemoryIntegrationRegistry({
        integrations: [new FakeIntegration({ feed: this.feed })],
      }),
      identity: {
        session: async ({ headers }): Promise<PrincipalSession | null> => {
          const userId = /session=(?<id>[\w-]+)/u.exec(
            headers.get('cookie') ?? '',
          )?.groups?.['id'];
          return userId === undefined
            ? null
            : { principalId: userId, kind: 'user', expiresAt: fixedNow };
        },
      },
      linkedAccounts: this.linkedAccounts,
      reader: this.records,
      writer: this.records,
      connections: this.connections,
      syncRequests: this.syncRequests,
      watchedChecks: this.watchedChecks,
      webhookEvents: this.webhookEvents,
    });
  }

  /** Links `login` as the person's GitHub account. The sealed token is never opened by the feed. */
  async link(props: { userId: string; login: string }): Promise<this> {
    await this.linkedAccounts.save({
      userId: props.userId,
      account: {
        provider: 'github',
        externalId: `id-${props.login}`,
        url: `https://github.com/${props.login}`,
        login: props.login,
        kind: 'user',
      },
      sealedAccessToken: 'sealed',
      accessTokenExpiresAt: null,
      sealedRefreshToken: null,
      refreshTokenExpiresAt: null,
    });
    return this;
  }

  async start(): Promise<ZodFastifyInstance> {
    this.app ??= await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [this.module],
    }).build();
    return this.app;
  }

  async stop(): Promise<void> {
    await this.app?.close();
    this.app = undefined;
  }

  static cookie(userId: string) {
    return { cookie: `session=${userId}` };
  }
}
