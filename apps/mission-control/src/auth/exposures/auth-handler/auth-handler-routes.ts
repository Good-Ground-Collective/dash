import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/** Connection-level headers that describe the hop, not the message. */
const hopHeaders: ReadonlySet<string> = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'transfer-encoding',
]);

/**
 * Mounts Better Auth under its base path. Each Fastify request becomes a Web `Request` with
 * the body bytes untouched, and the Web `Response` is copied back, `Set-Cookie` lines intact.
 */
export class AuthHandlerRoutes {
  private readonly identity: Identity;

  constructor(props: { identity: Identity }) {
    this.identity = props.identity;
  }

  register(app: ZodFastifyInstance): void {
    app.removeAllContentTypeParsers();
    app.addContentTypeParser(
      '*',
      { parseAs: 'buffer' },
      (_request, body, done) => {
        done(null, body);
      },
    );

    app.route({
      method: ['GET', 'POST'],
      url: `${this.identity.basePath}/*`,
      handler: async (request, reply) => {
        const response = await this.identity.handle(this.toRequest(request));
        return this.send({ response, reply });
      },
    });
  }

  private async send(props: {
    response: Response;
    reply: FastifyReply;
  }): Promise<FastifyReply> {
    const { response, reply } = props;
    reply.code(response.status);

    for (const [name, value] of response.headers) {
      if (name !== 'set-cookie' && !hopHeaders.has(name)) {
        reply.header(name, value);
      }
    }

    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) {
      reply.header('set-cookie', cookies);
    }

    return reply.send(
      response.body === null
        ? undefined
        : Buffer.from(await response.arrayBuffer()),
    );
  }

  private toRequest(request: FastifyRequest): Request {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (value === undefined || hopHeaders.has(name)) {
        continue;
      }
      for (const item of [value].flat()) {
        headers.append(name, item);
      }
    }

    const url = new URL(request.url, this.identity.baseUrl);
    return Buffer.isBuffer(request.body)
      ? new Request(url, {
          method: request.method,
          headers,
          body: request.body,
        })
      : new Request(url, { method: request.method, headers });
  }
}
