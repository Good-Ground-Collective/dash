import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';
import type { AppConfig } from '#src/platform/definitions/config/app-config.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';
import type { Database } from '#src/platform/services/database/database.ts';
import type { WorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

export interface PlatformModuleProps {
  config: AppConfig;
  database: Database;
  workflows: WorkflowRuntime;
  httpModules: readonly HttpModule[];
  workflowModules: readonly WorkflowModule[];
}

/** One process, one entry point: starts DBOS and the HTTP server together and stops them together. */
export class PlatformModule {
  private readonly props: PlatformModuleProps;
  private readonly server: HttpServer;
  private stopping: Promise<void> | null = null;
  private stopServer: (() => Promise<void>) | null = null;

  constructor(props: PlatformModuleProps) {
    this.props = props;
    this.server = new HttpServer({
      config: props.config,
      modules: props.httpModules,
    });
  }

  async start(): Promise<void> {
    const { config, workflowModules, workflows } = this.props;

    const app = await this.server.build();
    this.stopServer = () => app.close();
    await app.ready();

    for (const module of workflowModules) {
      module.registerWorkflows();
    }
    await workflows.launch();
    for (const module of workflowModules) {
      await module.activate();
    }

    await app.listen({ host: config.host, port: config.port });
  }

  /** Attempts every step even when an earlier one fails, then reports all failures together. A repeat call reuses the first shutdown. */
  async stop(): Promise<void> {
    this.stopping ??= this.stopOnce();
    return this.stopping;
  }

  private async stopOnce(): Promise<void> {
    const steps = [
      async () => this.stopServer?.(),
      async () => this.props.workflows.shutdown(),
      async () => this.props.database.close(),
    ];

    const failures: Error[] = [];
    for (const step of steps) {
      try {
        await step();
      } catch (cause) {
        failures.push(
          cause instanceof Error ? cause : new Error(String(cause)),
        );
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        'Mission Control did not stop cleanly',
      );
    }
  }
}
