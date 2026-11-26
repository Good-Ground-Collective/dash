import {
  agentHeartbeatBodySchema,
  agentHeartbeatParamsSchema,
  agentHeartbeatSchema,
} from '#src/agents/contracts/agent-heartbeat.ts';
import type { AgentHeartbeats } from '#src/agents/services/agent-heartbeats/agent-heartbeats.ts';
import type { AgentAuthentication } from '#src/auth/exposures/api-key-authentication/api-key-authentication.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/** `POST /api/agents/:agentName/heartbeats`, for a service account key with `heartbeat:write`. An empty body is a heartbeat, even one sent as `application/json`, which Fastify's own parser would refuse. */
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
    const parseJson = app.getDefaultJsonParser('error', 'error');
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (request, body, done) => {
        const text = body.toString();
        if (text === '') {
          done(null, null);
          return;
        }
        parseJson(request, text, done);
      },
    );

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
