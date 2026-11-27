import { z } from 'zod';

import {
  agentHeartbeatBatchResultsSchema,
  agentHeartbeatBatchSchema,
  agentHeartbeatMessageSchema,
  agentHeartbeatParamsSchema,
  storedAgentHeartbeatSchema,
} from '#src/agents/contracts/agent-heartbeat.ts';
import type { AgentHeartbeats } from '#src/agents/services/agent-heartbeats/agent-heartbeats.ts';
import type { AgentAuthentication } from '#src/auth/exposures/api-key-authentication/api-key-authentication.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

const agentHeartbeatsRoutesPropsSchema = z.object({
  authentication: z.custom<AgentAuthentication>(),
  heartbeats: z.custom<AgentHeartbeats>(),
});

/**
 * `POST /api/agents/:reporterName/heartbeats` and its `/batch`, for a service account key with
 * `heartbeat:write`. A new heartbeat answers 201 and a `(sessionId, seq)` the same key already
 * sent answers 200 with that row. A batch of up to 100 answers 200 with one result per heartbeat.
 */
export class AgentHeartbeatsRoutes {
  private readonly authentication: AgentAuthentication;
  private readonly heartbeats: AgentHeartbeats;

  constructor(props: z.input<typeof agentHeartbeatsRoutesPropsSchema>) {
    const parsed = agentHeartbeatsRoutesPropsSchema.parse(props);
    this.authentication = parsed.authentication;
    this.heartbeats = parsed.heartbeats;
  }

  register(app: ZodFastifyInstance): void {
    app.post(
      '/api/agents/:reporterName/heartbeats',
      {
        onRequest: this.authentication.require('heartbeat:write'),
        schema: {
          params: agentHeartbeatParamsSchema,
          body: agentHeartbeatMessageSchema,
          response: {
            200: storedAgentHeartbeatSchema,
            201: storedAgentHeartbeatSchema,
          },
        },
      },
      async (request, reply) => {
        const { outcome, heartbeat } = await this.heartbeats.report({
          caller: this.authentication.caller(request),
          reporterName: request.params.reporterName,
          message: request.body,
        });
        return reply.code(outcome === 'created' ? 201 : 200).send(heartbeat);
      },
    );

    app.post(
      '/api/agents/:reporterName/heartbeats/batch',
      {
        onRequest: this.authentication.require('heartbeat:write'),
        schema: {
          params: agentHeartbeatParamsSchema,
          body: agentHeartbeatBatchSchema,
          response: { 200: agentHeartbeatBatchResultsSchema },
        },
      },
      async (request) => ({
        results: await this.heartbeats.reportBatch({
          caller: this.authentication.caller(request),
          reporterName: request.params.reporterName,
          items: request.body.heartbeats,
        }),
      }),
    );
  }
}
