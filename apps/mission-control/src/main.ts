import { AgentsModule } from '#src/agents/module.ts';
import { DrizzleAgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import { DrizzleAgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import { AuthModule } from '#src/auth/module.ts';
import { DrizzleAuthStore } from '#src/auth/repositories/auth-store/auth-store.ts';
import { DrizzleServicePrincipalRepository } from '#src/auth/repositories/service-principals/service-principal-repository.ts';
import { ConnectionsModule } from '#src/connections/module.ts';
import { DrizzleConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import { DrizzleInstallRequestRepository } from '#src/connections/repositories/install-requests/install-request-repository.ts';
import { DrizzleLinkedAccountRepository } from '#src/connections/repositories/linked-accounts/linked-account-repository.ts';
import { DrizzleWebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import { InMemoryWebhookEventRegistry } from '#src/connections/services/webhook-event-registry/webhook-event-registry.ts';
import { GithubFeedModule } from '#src/github-feed/module.ts';
import { DrizzleGithubRecordReader } from '#src/github-feed/repositories/github-records/github-record-reader.ts';
import { DrizzleGithubRecordWriter } from '#src/github-feed/repositories/github-records/github-record-writer.ts';
import { DrizzleSyncRequestRepository } from '#src/github-feed/repositories/sync-requests/sync-request-repository.ts';
import { HealthModule } from '#src/health/module.ts';
import { HeartbeatModule } from '#src/heartbeat/module.ts';
import { DrizzleHeartbeatRepository } from '#src/heartbeat/repositories/heartbeats/heartbeat-repository.ts';
import { LiveModule } from '#src/live/module.ts';
import { IntegrationsModule } from '#src/integrations/module.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';
import { ObjectivesModule } from '#src/objectives/module.ts';
import { DrizzleObjectiveOverlayRepository } from '#src/objectives/repositories/objective-overlays/objective-overlay-repository.ts';
import { DrizzleObjectiveRecordReader } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import { DrizzleObjectiveRecordWriter } from '#src/objectives/repositories/objective-records/objective-record-writer.ts';
import { DrizzleStoredInitiatives } from '#src/objectives/repositories/objective-records/stored-initiatives.ts';
import { OnboardingModule } from '#src/onboarding/module.ts';
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
const connectionRepository = new DrizzleConnectionRepository({ database });
const linkedAccounts = new DrizzleLinkedAccountRepository({ database });
const webhookEvents = new InMemoryWebhookEventRegistry();
const githubFeed = new GithubFeedModule({
  registry: integrations.registry,
  identity: auth.identity,
  linkedAccounts,
  reader: new DrizzleGithubRecordReader({ database }),
  writer: new DrizzleGithubRecordWriter({ database }),
  connections: connectionRepository,
  syncRequests: new DrizzleSyncRequestRepository({ database }),
  webhookEvents,
});
const objectives = new ObjectivesModule({
  registry: integrations.registry,
  identity: auth.identity,
  reader: new DrizzleObjectiveRecordReader({ database }),
  writer: new DrizzleObjectiveRecordWriter({ database }),
  overlays: new DrizzleObjectiveOverlayRepository({ database }),
});
const connections = new ConnectionsModule({
  registry: integrations.registry,
  identity: auth.identity,
  connections: connectionRepository,
  linkedAccounts,
  installRequests: new DrizzleInstallRequestRepository({ database }),
  deliveries: new DrizzleWebhookDeliveryRepository({ database }),
  webhookEvents,
  secret: config.authSecret,
  baseUrl: config.authBaseUrl,
  webOrigin: config.webOrigin,
  listeners: [githubFeed, objectives],
});
const liveEvents = new InProcessLiveEvents();
const agents = new AgentsModule({
  authentication: auth.agentAuthentication,
  identity: auth.identity,
  heartbeatRepository: new DrizzleAgentHeartbeatRepository({ database }),
  sessionRepository: new DrizzleAgentSessionRepository({ database }),
  liveEvents,
});
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
    agents,
    connections,
    githubFeed,
    objectives,
    new OnboardingModule({
      identity: auth.identity,
      connections: connectionRepository,
      initiatives: new DrizzleStoredInitiatives({ database }),
    }),
    new LiveModule({ liveEvents, identity: auth.identity }),
    heartbeat,
  ],
  workflowModules: [heartbeat, agents, githubFeed, objectives, connections],
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
