import {
  type ConnectFlow,
  connectFlowCapability,
  type IntegrationRegistry,
} from '@dash/integrations-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import type { ConnectListener } from '#src/connections/contracts/connect-listener.ts';
import { AccountsRoutes } from '#src/connections/exposures/accounts-routes/accounts-routes.ts';
import { ConnectRoutes } from '#src/connections/exposures/connect-routes/connect-routes.ts';
import { WebhookRoutes } from '#src/connections/exposures/webhook-routes/webhook-routes.ts';
import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type { LinkedAccountRepository } from '#src/connections/repositories/linked-accounts/linked-account-repository.ts';
import type { WebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import { ConnectPaths } from '#src/connections/services/connect-paths/connect-paths.ts';
import { ConnectableAccounts } from '#src/connections/services/connectable-accounts/connectable-accounts.ts';
import {
  type ConnectState,
  SignedConnectState,
} from '#src/connections/services/connect-state/connect-state.ts';
import { OwnedInstallationChanges } from '#src/connections/services/installation-changes/installation-changes.ts';
import { OwnedConnections } from '#src/connections/services/owned-connections/owned-connections.ts';
import { DbosSuspensionRecheck } from '#src/connections/services/suspension-recheck/suspension-recheck.ts';
import { AesGcmTokenCipher } from '#src/connections/services/token-cipher/token-cipher.ts';
import {
  DbosWebhookDispatch,
  type WebhookDispatch,
} from '#src/connections/services/webhook-dispatch/webhook-dispatch.ts';
import type { WebhookEventRegistry } from '#src/connections/services/webhook-event-registry/webhook-event-registry.ts';
import { DbosWebhookRetention } from '#src/connections/services/webhook-retention/webhook-retention.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';
import { webOriginSchema } from '#src/platform/definitions/config/app-config.ts';

const connectionsModulePropsSchema = z.object({
  registry: z.custom<IntegrationRegistry>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
  connections: z.custom<ConnectionRepository>(),
  linkedAccounts: z.custom<LinkedAccountRepository>(),
  deliveries: z.custom<WebhookDeliveryRepository>(),
  webhookEvents: z
    .custom<WebhookEventRegistry>()
    .describe('Where modules register the webhook events they act on.'),
  secret: z
    .string()
    .min(32)
    .describe(
      "Mission Control's auth secret. Keys for the connect state and the token cipher are derived from it.",
    ),
  baseUrl: webOriginSchema,
  webOrigin: webOriginSchema,
  listener: z.custom<ConnectListener>().optional(),
});

type ConnectionsModuleProps = z.output<typeof connectionsModulePropsSchema>;

type ProviderRoutes = AccountsRoutes | ConnectRoutes | WebhookRoutes;

/**
 * `owned` connections: for every registered integration that offers a connect flow, the
 * install and OAuth callbacks, the connectable accounts and the webhook endpoint under
 * `/integrations/<provider>`, the workflows that process and prune stored deliveries, and the
 * one that lifts a suspension the provider no longer reports.
 * Provider-neutral: it reaches providers only through `connectFlowCapability`.
 */
export class ConnectionsModule implements HttpModule, WorkflowModule {
  readonly plugin: FastifyPluginAsyncZod;
  /** Each provider's owned connections, by provider id. */
  readonly owned: ReadonlyMap<string, OwnedConnections>;
  private readonly workflows: readonly WorkflowModule[];

  constructor(input: z.input<typeof connectionsModulePropsSchema>) {
    const props = connectionsModulePropsSchema.parse(input);
    const cipher = new AesGcmTokenCipher({ secret: props.secret });
    const state: ConnectState = new SignedConnectState({
      secret: props.secret,
    });
    const owned = new Map<string, OwnedConnections>();
    const routes: ProviderRoutes[] = [];
    const offered = props.registry.offering(connectFlowCapability);
    const flows = new Map(
      offered.map(({ integration, implementation }) => [
        integration.provider,
        implementation,
      ]),
    );
    const dispatch = new DbosWebhookDispatch({
      registry: props.webhookEvents,
      deliveries: props.deliveries,
      changes: new OwnedInstallationChanges({
        flows,
        connections: props.connections,
      }),
    });
    this.workflows = [
      dispatch,
      ...ConnectionsModule.scheduledWorkflows({ module: props, flows }),
    ];

    for (const { integration, implementation: flow } of offered) {
      const connections = new OwnedConnections({
        provider: integration.provider,
        flow,
        connections: props.connections,
        linkedAccounts: props.linkedAccounts,
        cipher,
      });
      owned.set(integration.provider, connections);
      routes.push(
        ...ConnectionsModule.routesFor({
          module: props,
          flow,
          owned: connections,
          state,
          dispatch,
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

  registerWorkflows(): void {
    for (const workflows of this.workflows) {
      workflows.registerWorkflows();
    }
  }

  async activate(): Promise<void> {
    for (const workflows of this.workflows) {
      await workflows.activate();
    }
  }

  private static scheduledWorkflows(props: {
    module: ConnectionsModuleProps;
    flows: ReadonlyMap<string, ConnectFlow>;
  }): WorkflowModule[] {
    return [
      new DbosWebhookRetention({ deliveries: props.module.deliveries }),
      new DbosSuspensionRecheck({
        flows: props.flows,
        connections: props.module.connections,
        listener: props.module.listener,
      }),
    ];
  }

  private static routesFor(props: {
    module: ConnectionsModuleProps;
    flow: ConnectFlow;
    owned: OwnedConnections;
    state: ConnectState;
    dispatch: WebhookDispatch;
  }): ProviderRoutes[] {
    const { module, flow, owned, state } = props;
    const paths = new ConnectPaths({
      provider: owned.provider,
      baseUrl: module.baseUrl,
    });
    return [
      new ConnectRoutes({
        connections: owned,
        flow,
        identity: module.identity,
        state,
        paths,
        webOrigin: module.webOrigin,
        listener: module.listener,
      }),
      new AccountsRoutes({
        accounts: new ConnectableAccounts({
          owned,
          flow,
          connections: module.connections,
        }),
        flow,
        identity: module.identity,
        state,
        paths,
      }),
      new WebhookRoutes({
        provider: owned.provider,
        flow,
        connections: module.connections,
        deliveries: module.deliveries,
        dispatch: props.dispatch,
      }),
    ];
  }
}
