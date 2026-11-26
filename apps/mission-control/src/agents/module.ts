import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { AgentHeartbeatsRoutes } from '#src/agents/exposures/agent-heartbeats/agent-heartbeats-routes.ts';
import type { AgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import {
  type AgentHeartbeats,
  CallerCheckedAgentHeartbeats,
} from '#src/agents/services/agent-heartbeats/agent-heartbeats.ts';
import type { AgentAuthentication } from '#src/auth/exposures/api-key-authentication/api-key-authentication.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

/** What agents send Mission Control, authenticated with service account keys. Heartbeats for now; telemetry joins it under `/api/agents/:agentName`. */
export class AgentsModule implements HttpModule {
  readonly plugin: FastifyPluginAsyncZod;
  readonly heartbeats: AgentHeartbeats;

  constructor(props: {
    authentication: AgentAuthentication;
    heartbeatRepository: AgentHeartbeatRepository;
  }) {
    this.heartbeats = new CallerCheckedAgentHeartbeats({
      repository: props.heartbeatRepository,
    });
    const routes = new AgentHeartbeatsRoutes({
      authentication: props.authentication,
      heartbeats: this.heartbeats,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }
}
