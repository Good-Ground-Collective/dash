import cors from '@fastify/cors';
import Fastify, { type FastifyRequest } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import type {
  HttpModule,
  ZodFastifyInstance,
} from '#src/platform/contracts/http-module.ts';
import {
  environmentSchema,
  logLevelSchema,
  webOriginSchema,
} from '#src/platform/definitions/config/app-config.ts';

export const httpServerConfigSchema = z.object({
  corsOrigins: z.array(webOriginSchema).readonly(),
  environment: environmentSchema,
  logLevel: logLevelSchema,
});

export type HttpServerConfig = z.input<typeof httpServerConfigSchema>;

/** What a request log line says about the request. */
type LoggedRequest = {
  method: string;
  url: string;
  host: string;
  remoteAddress: string;
  remotePort: number;
};

/** Builds the Fastify app: pino logging, Zod schemas, the CORS allowlist and one scope per module. */
export class HttpServer {
  private readonly props: {
    config: z.output<typeof httpServerConfigSchema>;
    modules: readonly HttpModule[];
  };

  constructor(props: {
    config: HttpServerConfig;
    modules: readonly HttpModule[];
  }) {
    this.props = {
      config: httpServerConfigSchema.parse(props.config),
      modules: props.modules,
    };
  }

  async build(): Promise<ZodFastifyInstance> {
    const { environment, logLevel } = this.props.config;
    const serializers = { req: this.loggedRequest };
    const app = Fastify({
      logger:
        environment === 'development'
          ? {
              level: logLevel,
              serializers,
              transport: { target: 'pino-pretty' },
            }
          : { level: logLevel, serializers },
    }).withTypeProvider<ZodTypeProvider>();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    await app.register(cors, {
      origin: [...this.props.config.corsOrigins],
      credentials: true,
    });

    for (const module of this.props.modules) {
      await app.register(module.plugin);
    }
    return app;
  }

  /** Logs the path without its query string, which can carry one-time credentials such as a passkey enrolment's `context`. */
  private readonly loggedRequest = (
    request: FastifyRequest,
  ): LoggedRequest => ({
    method: request.method,
    url: request.url.split('?', 1)[0] ?? '',
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket.remotePort ?? 0,
  });
}
