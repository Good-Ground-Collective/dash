import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { RawBody } from '#src/platform/exposures/raw-body/raw-body.ts';

describe('RawBody', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('keeps the exact bytes inside the capturing scope only', async () => {
    app = Fastify();
    await app.register(async (scope) => {
      RawBody.capture(scope);
      scope.post('/signed', (request) => ({
        raw: request.rawBody?.toString('utf8'),
        parsed: request.body,
      }));
    });
    app.post('/plain', (request) => ({
      hasRaw: request.rawBody !== undefined,
    }));
    const payload = '{ "action":  "opened" }';

    const signed = await app.inject({
      method: 'POST',
      url: '/signed',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    const plain = await app.inject({
      method: 'POST',
      url: '/plain',
      headers: { 'content-type': 'application/json' },
      payload,
    });

    expect(signed.json()).toEqual({
      raw: payload,
      parsed: { action: 'opened' },
    });
    expect(plain.json()).toEqual({ hasRaw: false });
  });

  it('still rejects malformed JSON', async () => {
    app = Fastify();
    await app.register(async (scope) => {
      RawBody.capture(scope);
      scope.post('/signed', () => ({ ok: true }));
    });

    const response = await app.inject({
      method: 'POST',
      url: '/signed',
      headers: { 'content-type': 'application/json' },
      payload: '{"action":',
    });

    expect(response.statusCode).toBe(400);
  });
});
