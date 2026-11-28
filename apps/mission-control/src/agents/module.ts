import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AgentHeartbeatsRoutes } from '#src/agents/exposures/agent-heartbeats/agent-heartbeats-routes.ts';
import { AgentSessionsRoutes } from '#src/agents/exposures/agent-sessions/agent-sessions-routes.ts';
import type { AgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import type { AgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import { AgentHeartbeatRetentionWorkflows } from '#src/agents/services/agent-heartbeat-retention-workflows/agent-heartbeat-retention-workflows.ts';
import {
  type AgentHeartbeats,
  CallerCheckedAgentHeartbeats,
} from '#src/agents/services/agent-heartbeats/agent-heartbeats.ts';
import type { AgentAuthentication } from '#src/auth/exposures/api-key-authentication/api-key-authentication.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const agentsModulePropsSchema = z.object({
  authentication: z.custom<AgentAuthentication>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
  heartbeatRepository: z.custom<AgentHeartbeatRepository>(),
  sessionRepository: z.custom<AgentSessionRepository>(),
  liveEvents: z.custom<LiveEvents>(),
});

/**
 * Agent sessions: `agent.heartbeat` messages that agents send with service account keys, the
 * current state of each session and subagent they keep, and `GET /api/agents/sessions` for
 * signed-in people. Raw heartbeats are kept for 30 days.
 */
export class AgentsModule implements HttpModule, WorkflowModule {
  readonly plugin: FastifyPluginAsyncZod;
  readonly heartbeats: AgentHeartbeats;
  private readonly retention: AgentHeartbeatRetentionWorkflows;

  constructor(input: z.input<typeof agentsModulePropsSchema>) {
    const props = agentsModulePropsSchema.parse(input);
    this.heartbeats = new CallerCheckedAgentHeartbeats({
      repository: props.heartbeatRepository,
      liveEvents: props.liveEvents,
    });
    this.retention = new AgentHeartbeatRetentionWorkflows({
      repository: props.heartbeatRepository,
    });

    const heartbeatRoutes = new AgentHeartbeatsRoutes({
      authentication: props.authentication,
      heartbeats: this.heartbeats,
    });
    const sessionRoutes = new AgentSessionsRoutes({
      sessions: props.sessionRepository,
      identity: props.identity,
    });
    this.plugin = async (app) => {
      heartbeatRoutes.register(app);
      sessionRoutes.register(app);
    };
  }

  async activate(): Promise<void> {
    await this.retention.activate();
  }

  registerWorkflows(): void {
    this.retention.registerWorkflows();
  }
}
