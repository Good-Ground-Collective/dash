import OpenAI from 'openai';

import { AgentsModule } from '#src/agents/module.ts';
import { DrizzleAgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import { DrizzleAgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import { DrizzleNeedsYouItemRepository } from '#src/agents/repositories/needs-you-items/needs-you-item-repository.ts';
import { AuthModule } from '#src/auth/module.ts';
import { DrizzleAuthStore } from '#src/auth/repositories/auth-store/auth-store.ts';
import { DrizzleServicePrincipalRepository } from '#src/auth/repositories/service-principals/service-principal-repository.ts';
import { BriefingModule } from '#src/briefing/module.ts';
import { DrizzlePersonTimeZoneReader } from '#src/briefing/repositories/people-time-zones/person-time-zone-reader.ts';
import { SourcedBriefingSnapshot } from '#src/briefing/services/briefing-snapshot/briefing-snapshot.ts';
import { DbosBriefingWorkflows } from '#src/briefing/services/briefing-workflows/briefing-workflows.ts';
import { OpenAiBriefingWriter } from '#src/briefing/services/briefing-writer/briefing-writer.ts';
import { DrizzleBriefingRepository } from '#src/briefing/repositories/briefings/briefing-repository.ts';
import { DrizzleOwnerTimeZoneReader } from '#src/briefing/repositories/owner-time-zones/owner-time-zone-reader.ts';
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
import { DbosStrandedWorkflowRecovery } from '#src/platform/services/workflows/stranded-workflow-recovery.ts';
import { LatestVersionGauge } from '#src/platform/services/workflows/latest-version-gauge.ts';
import { StrandedWorkflowGauge } from '#src/platform/services/workflows/stranded-workflow-gauge.ts';
import { UnregisteredStrandedWorkflowGauge } from '#src/platform/services/workflows/unregistered-stranded-workflow-gauge.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';
import { WorkflowRuntimeConfig } from '#src/platform/services/workflows/workflow-runtime.config.ts';

const config = AppConfig.fromEnvironment();
const database = new PostgresDatabase({ url: config.databaseUrl });
const strandedWorkflows = new DbosStrandedWorkflowRecovery();
const workflows = new DbosWorkflowRuntime({
  databaseUrl: config.databaseUrl,
  logLevel: config.logLevel,
  forceLatestVersion:
    WorkflowRuntimeConfig.fromEnvironment().forceLatestVersion,
  recovery: strandedWorkflows,
});
const servicePrincipals = new DrizzleServicePrincipalRepository({ database });
const agentSessions = new DrizzleAgentSessionRepository({ database });
const auth = new AuthModule({
  store: new DrizzleAuthStore({ database }),
  servicePrincipalRepository: servicePrincipals,
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
const githubRecords = new DrizzleGithubRecordReader({ database });
const githubFeed = new GithubFeedModule({
  registry: integrations.registry,
  identity: auth.identity,
  linkedAccounts,
  reader: githubRecords,
  writer: new DrizzleGithubRecordWriter({ database }),
  connections: connectionRepository,
  syncRequests: new DrizzleSyncRequestRepository({ database }),
  webhookEvents,
});
const objectiveRecords = new DrizzleObjectiveRecordReader({ database });
const objectiveOverlays = new DrizzleObjectiveOverlayRepository({ database });
const objectives = new ObjectivesModule({
  registry: integrations.registry,
  identity: auth.identity,
  reader: objectiveRecords,
  writer: new DrizzleObjectiveRecordWriter({ database }),
  overlays: objectiveOverlays,
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
  sessionRepository: agentSessions,
  needsYouRepository: new DrizzleNeedsYouItemRepository({ database }),
  liveEvents,
});

const briefings = new DrizzleBriefingRepository({ database });
const ownerTimeZone = new DrizzleOwnerTimeZoneReader({ database });
const briefing = new BriefingModule({
  briefings,
  ownerTimeZone,
  workflows: new DbosBriefingWorkflows({
    briefings,
    ownerTimeZone,
    people: new DrizzlePersonTimeZoneReader({ database }),
    snapshot: new SourcedBriefingSnapshot({
      objectives: objectiveRecords,
      overlays: objectiveOverlays,
      github: githubRecords,
      sessions: agentSessions,
      principals: servicePrincipals,
    }),
    liveEvents,
    generation:
      config.briefing === null
        ? null
        : {
            settings: config.briefing,
            writer: new OpenAiBriefingWriter({
              client: new OpenAI({
                apiKey: config.briefing.apiKey,
                maxRetries: 0,
                timeout: 60_000,
              }),
              settings: config.briefing,
            }),
          },
  }),
  identity: auth.identity,
  settings: config.briefing,
});

const platform = new PlatformModule({
  config,
  database,
  workflows,
  httpModules: [
    new HealthModule({
      probes: [database, workflows],
      gauges: [
        new StrandedWorkflowGauge({ recovery: strandedWorkflows }),
        new UnregisteredStrandedWorkflowGauge({ recovery: strandedWorkflows }),
        new LatestVersionGauge(),
      ],
      build: config.build,
    }),
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
    briefing,
  ],
  workflowModules: [agents, githubFeed, objectives, connections, briefing],
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
