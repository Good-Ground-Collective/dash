import {
  type Capabilities,
  type Capability,
  CapabilitySet,
  connectFlowCapability,
  InMemoryIntegrationRegistry,
  type Integration,
} from '@dash/integrations-core';

import { vi } from 'vitest';

import type { PrincipalSession } from '#src/auth/services/identity/identity.ts';
import { FakeConnectFlow } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import {
  InMemoryConnectionRepository,
  InMemoryLinkedAccountRepository,
  InMemoryWebhookDeliveryRepository,
} from '#src/connections/__tests__/support/in-memory-connections.ts';
import { ConnectionsModule } from '#src/connections/module.ts';
import { SignedConnectState } from '#src/connections/services/connect-state/connect-state.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

export const adaId = '00000000-0000-4000-8000-00000000000a';
export const graceId = '00000000-0000-4000-8000-00000000000b';
export const webOrigin = 'http://localhost:5173';
export const baseUrl = 'http://localhost:3000';
export const secret = 'test-secret-that-is-at-least-32-characters';
export const fixedNow = new Date('2026-11-26T12:00:00Z');

/** Offers the fake connect flow as the `github` provider, so routes sit where GitHub's will. */
class FakeIntegration implements Integration {
  readonly id = 'github';
  readonly provider = 'github';
  private readonly capabilities: Capabilities;

  constructor(props: { flow: FakeConnectFlow }) {
    this.capabilities = CapabilitySet.empty().with(
      connectFlowCapability,
      props.flow,
    );
  }

  capability<T extends object>(capability: Capability<T>): T | undefined {
    return this.capabilities.get(capability);
  }
}

/**
 * The connections module over in-memory storage and a fake provider. A `session=<user id>`
 * cookie signs that person in. Tests freeze the clock at `fixedNow` with `freezeClock`.
 */
export class ConnectionsHarness {
  readonly flow = new FakeConnectFlow();
  readonly connections = new InMemoryConnectionRepository();
  readonly linkedAccounts = new InMemoryLinkedAccountRepository();
  readonly deliveries = new InMemoryWebhookDeliveryRepository();
  readonly module: ConnectionsModule;
  private app: ZodFastifyInstance | undefined;

  private readonly logLevel: 'info' | 'silent';

  constructor(
    props: { offerFlow?: boolean; logLevel?: 'info' | 'silent' } = {},
  ) {
    this.logLevel = props.logLevel ?? 'silent';
    this.module = new ConnectionsModule({
      registry: new InMemoryIntegrationRegistry({
        integrations:
          props.offerFlow === false
            ? []
            : [new FakeIntegration({ flow: this.flow })],
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
      connections: this.connections,
      linkedAccounts: this.linkedAccounts,
      deliveries: this.deliveries,
      secret,
      baseUrl,
      webOrigin,
    });
  }

  async start(): Promise<ZodFastifyInstance> {
    this.app ??= await new HttpServer({
      config: {
        corsOrigins: [webOrigin],
        environment: 'test',
        logLevel: this.logLevel,
      },
      modules: [this.module],
    }).build();
    return this.app;
  }

  /** The state `GET /connect` puts in the authorize or install URL for `userId`. */
  async issuedState(props: {
    userId: string;
    url: 'authorizeUrl' | 'installUrl';
  }): Promise<string> {
    const app = await this.start();
    const response = await app.inject({
      url: '/integrations/github/connect?returnTo=/setup/github',
      headers: ConnectionsHarness.cookie(props.userId),
    });
    return ConnectionsHarness.stateOf(
      response.json<Record<string, string>>()[props.url],
    );
  }

  async stop(): Promise<void> {
    await this.app?.close();
    this.app = undefined;
  }

  static freezeClock(): void {
    vi.useFakeTimers({ toFake: ['Date'], now: fixedNow });
  }

  static cookie(userId: string) {
    return { cookie: `session=${userId}` };
  }

  /** The `state` query parameter of a URL the routes handed out. */
  static stateOf(url: string | undefined): string {
    return new URL(url ?? '').searchParams.get('state') ?? '';
  }

  /** A state as an install link for a chosen account carries it. Call with the clock frozen. */
  static requestState(props: {
    userId: string;
    targetAccountId: string;
  }): string {
    return new SignedConnectState({ secret }).issue({
      ...props,
      provider: 'github',
      returnTo: '/setup/github',
    });
  }
}
