import {
  heartbeatListQuerySchema,
  heartbeatListSchema,
} from '#src/heartbeat/contracts/heartbeat.ts';
import type { HeartbeatRepository } from '#src/heartbeat/repositories/heartbeats/heartbeat-repository.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

export class HeartbeatsRoutes {
  private readonly repository: HeartbeatRepository;

  constructor(props: { repository: HeartbeatRepository }) {
    this.repository = props.repository;
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      '/heartbeats',
      {
        schema: {
          querystring: heartbeatListQuerySchema,
          response: { 200: heartbeatListSchema },
        },
      },
      async (request) => ({
        heartbeats: await this.repository.listRecent({
          limit: request.query.limit,
        }),
      }),
    );
  }
}
