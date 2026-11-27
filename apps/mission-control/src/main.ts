import { AgentsModule } from '#src/agents/module.ts';
import { DrizzleAgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import { AuthModule } from '#src/auth/module.ts';
import { DrizzleAuthStore } from '#src/auth/repositories/auth-store/auth-store.ts';
import { DrizzleServicePrincipalRepository } from '#src/auth/repositories/service-principals/service-principal-repository.ts';
import { ConnectionsModule } from '#src/connections/module.ts';
import { DrizzleConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import { DrizzleLinkedAccountRepository } from '#src/connections/repositories/linked-accounts/linked-account-repository.ts';
import { DrizzleWebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import { HealthModule } from '#src/health/module.ts';
import { HeartbeatModule } from '#src/heartbeat/module.ts';
import { DrizzleHeartbeatRepository } from '#src/heartbeat/repositories/heartbeats/heartbeat-repository.ts';
import { LiveModule } from '#src/live/module.ts';
import { IntegrationsModule } from '#src/integrations/module.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';
import { AppConfig } from '#src/platform/definitions/config/app-config.ts';
import { PlatformModule } from '#src/platform/module.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

const config = AppConfig.fromEnvironment();
const database = new PostgresDatabase({ url: config.databaseUrl });
const workflows = new DbosWorkflowRuntime({
  databaseUrl: config.databaseUrl,
  logLevel: config.logLevel,
});
const auth = new AuthModule({
  store: new DrizzleAuthStore({ database }),
  servicePrincipalRepository: new DrizzleServicePrincipalRepository({
    database,
  }),
  secret: config.authSecret,
  baseUrl: config.authBaseUrl,
  webOrigin: config.webOrigin,
  trustedOrigins: config.corsOrigins,
  cookieDomain: config.authCookieDomain,
  secureCookies: config.secureCookies,
  apiKeyPrefix: config.apiKeyPrefix,
});
const integrations = new IntegrationsModule({ githubApp: config.githubApp });
const connections = new ConnectionsModule({
  registry: integrations.registry,
  identity: auth.identity,
  connections: new DrizzleConnectionRepository({ database }),
  linkedAccounts: new DrizzleLinkedAccountRepository({ database }),
  deliveries: new DrizzleWebhookDeliveryRepository({ database }),
  secret: config.authSecret,
  baseUrl: config.authBaseUrl,
  webOrigin: config.webOrigin,
});
const liveEvents = new InProcessLiveEvents();
const heartbeat = new HeartbeatModule({
  liveEvents,
  repository: new DrizzleHeartbeatRepository({ database }),
});

const platform = new PlatformModule({
  config,
  database,
  workflows,
  httpModules: [
    new HealthModule({ probes: [database, workflows], build: config.build }),
    auth,
    new AgentsModule({
      authentication: auth.agentAuthentication,
      heartbeatRepository: new DrizzleAgentHeartbeatRepository({ database }),
    }),
    connections,
    new LiveModule({ liveEvents }),
    heartbeat,
  ],
  workflowModules: [heartbeat],
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    platform.stop().then(
      () => process.exit(0),
      (cause: unknown) => {
        console.error(cause);
        process.exit(1);
      },
    );
  });
}

await platform.start();
