import {
  agentHeartbeatBodySchema,
  agentHeartbeatParamsSchema,
  agentHeartbeatSchema,
} from '#src/agents/contracts/agent-heartbeat.ts';
import type { AgentHeartbeats } from '#src/agents/services/agent-heartbeats/agent-heartbeats.ts';
import type { AgentAuthentication } from '#src/auth/exposures/api-key-authentication/api-key-authentication.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/** `POST /api/agents/:agentName/heartbeats`, for a service account key with `heartbeat:write`. */
export class AgentHeartbeatsRoutes {
  private readonly authentication: AgentAuthentication;
  private readonly heartbeats: AgentHeartbeats;

  constructor(props: {
    authentication: AgentAuthentication;
    heartbeats: AgentHeartbeats;
  }) {
    this.authentication = props.authentication;
    this.heartbeats = props.heartbeats;
  }

  register(app: ZodFastifyInstance): void {
    app.post(
      '/api/agents/:agentName/heartbeats',
      {
        onRequest: this.authentication.require('heartbeat:write'),
        schema: {
          params: agentHeartbeatParamsSchema,
          body: agentHeartbeatBodySchema,
          response: { 201: agentHeartbeatSchema },
        },
      },
      async (request, reply) => {
        const heartbeat = await this.heartbeats.report({
          caller: this.authentication.caller(request),
          agentName: request.params.agentName,
          body: request.body,
        });
        return reply.code(201).send(heartbeat);
      },
    );
  }
}
