import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { HeartbeatsRoutes } from '#src/heartbeat/exposures/heartbeats/heartbeats-routes.ts';
import type { HeartbeatRepository } from '#src/heartbeat/repositories/heartbeats/heartbeat-repository.ts';
import { HeartbeatRecorder } from '#src/heartbeat/services/heartbeat-recorder/heartbeat-recorder.ts';
import { HeartbeatWorkflows } from '#src/heartbeat/services/heartbeat-workflows/heartbeat-workflows.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

/**
 * Example module showing the layout end to end: a Drizzle table and repository, a DBOS
 * schedule and queue, a Zod-typed route and a live event. Remove it once real modules land.
 */
export class HeartbeatModule implements HttpModule, WorkflowModule {
  readonly plugin: FastifyPluginAsyncZod;
  readonly recorder: HeartbeatRecorder;
  private readonly workflows: HeartbeatWorkflows;

  constructor(props: {
    liveEvents: LiveEvents;
    repository: HeartbeatRepository;
  }) {
    this.recorder = new HeartbeatRecorder(props);
    this.workflows = new HeartbeatWorkflows({ recorder: this.recorder });
    const routes = new HeartbeatsRoutes({ repository: props.repository });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }

  async activate(): Promise<void> {
    await this.workflows.activate();
  }

  registerWorkflows(): void {
    this.workflows.registerWorkflows();
  }
}
