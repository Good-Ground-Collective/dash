import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** The unparsed JSON body, set only inside a scope that called `RawBody.capture`. */
    rawBody?: Buffer;
  }
}

/**
 * Keeps the exact request bytes for routes that verify a signature over the body, such as
 * webhooks. Call `capture` inside an encapsulated plugin: only that scope's JSON parser
 * changes, so every other route keeps Fastify's default parser and holds no extra copy.
 */
export class RawBody {
  static capture(scope: FastifyInstance): void {
    const parseJson = scope.getDefaultJsonParser('error', 'error');
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (request, body, done) => {
        const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
        request.rawBody = bytes;
        parseJson(request, bytes.toString('utf8'), done);
      },
    );
  }
}
