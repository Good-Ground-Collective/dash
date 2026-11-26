import { AuthModule } from '#src/auth/module.ts';
import { DrizzleAuthStore } from '#src/auth/repositories/auth-store/auth-store.ts';
import { DrizzleServicePrincipalRepository } from '#src/auth/repositories/service-principals/service-principal-repository.ts';
import { HealthModule } from '#src/health/module.ts';
import { HeartbeatModule } from '#src/heartbeat/module.ts';
import { DrizzleHeartbeatRepository } from '#src/heartbeat/repositories/heartbeats/heartbeat-repository.ts';
import { LiveModule } from '#src/live/module.ts';
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
  storage: new DrizzleAuthStore({ database }).storage,
  servicePrincipalRepository: new DrizzleServicePrincipalRepository({
    database,
  }),
  secret: config.authSecret,
  baseUrl: config.authBaseUrl,
  trustedOrigins: config.corsOrigins,
  cookieDomain: config.authCookieDomain,
  secureCookies: config.secureCookies,
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
    new HealthModule({ probes: [database, workflows] }),
    auth,
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
