import {
  connectFlowCapability,
  type IntegrationRegistry,
} from '@dash/integrations-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import { ConnectRoutes } from '#src/connections/exposures/connect-routes/connect-routes.ts';
import { WebhookRoutes } from '#src/connections/exposures/webhook-routes/webhook-routes.ts';
import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type { LinkedAccountRepository } from '#src/connections/repositories/linked-accounts/linked-account-repository.ts';
import type { WebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import {
  type ConnectState,
  SignedConnectState,
} from '#src/connections/services/connect-state/connect-state.ts';
import { OwnedConnections } from '#src/connections/services/owned-connections/owned-connections.ts';
import { AesGcmTokenCipher } from '#src/connections/services/token-cipher/token-cipher.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

/**
 * `owned` connections: for every registered integration that offers a connect flow, the
 * install and OAuth callbacks and the webhook endpoint under `/integrations/<provider>`.
 * Provider-neutral: it reaches providers only through `connectFlowCapability`.
 */
export class ConnectionsModule implements HttpModule {
  readonly plugin: FastifyPluginAsyncZod;
  /** Each provider's owned connections, by provider id. */
  readonly owned: ReadonlyMap<string, OwnedConnections>;

  constructor(props: {
    registry: IntegrationRegistry;
    identity: Pick<Identity, 'session'>;
    connections: ConnectionRepository;
    linkedAccounts: LinkedAccountRepository;
    deliveries: WebhookDeliveryRepository;
    /** Mission Control's auth secret. Keys for the connect state and the token cipher are derived from it. */
    secret: string;
    baseUrl: string;
    webOrigin: string;
  }) {
    const cipher = new AesGcmTokenCipher({ secret: props.secret });
    const state: ConnectState = new SignedConnectState({
      secret: props.secret,
    });
    const owned = new Map<string, OwnedConnections>();
    const routes: (ConnectRoutes | WebhookRoutes)[] = [];

    for (const { integration, implementation: flow } of props.registry.offering(
      connectFlowCapability,
    )) {
      const connections = new OwnedConnections({
        provider: integration.provider,
        flow,
        connections: props.connections,
        linkedAccounts: props.linkedAccounts,
        cipher,
      });
      owned.set(integration.provider, connections);
      routes.push(
        new ConnectRoutes({
          connections,
          flow,
          identity: props.identity,
          state,
          baseUrl: props.baseUrl,
          webOrigin: props.webOrigin,
        }),
        new WebhookRoutes({
          provider: integration.provider,
          flow,
          connections: props.connections,
          deliveries: props.deliveries,
        }),
      );
    }

    this.owned = owned;
    this.plugin = async (app) => {
      for (const route of routes) {
        route.register(app);
      }
    };
  }
}
