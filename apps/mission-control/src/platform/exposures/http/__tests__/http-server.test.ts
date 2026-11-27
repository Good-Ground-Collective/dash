import { afterEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

describe('HttpServer', () => {
  let app: ZodFastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('allows credentialed requests from allowlisted origins only', async () => {
    app = await new HttpServer({
      config: {
        corsOrigins: ['https://dash.doublel.studio'],
        environment: 'test',
        logLevel: 'silent',
      },
      modules: [
        {
          plugin: async (scope) => {
            scope.get('/ping', () => ({ ok: true }));
          },
        },
      ],
    }).build();

    const allowed = await app.inject({
      url: '/ping',
      headers: { origin: 'https://dash.doublel.studio' },
    });
    const refused = await app.inject({
      url: '/ping',
      headers: { origin: 'https://evil.example' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://dash.doublel.studio',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each(['not a url', 'http://localhost:5173/'])(
    'rejects %j as a CORS origin',
    (origin) => {
      expect(
        () =>
          new HttpServer({
            config: {
              corsOrigins: [origin],
              environment: 'test',
              logLevel: 'silent',
            },
            modules: [],
          }),
      ).toThrow(ZodError);
    },
  );
});

/** Points a built app's pino logger, and so every request logger, at an in-memory list of lines. */
class CapturedLog {
  readonly lines: string[] = [];

  attach(app: ZodFastifyInstance): void {
    const stream = Object.getOwnPropertySymbols(app.log).find(
      (symbol) => symbol.description === 'pino.stream',
    );
    if (stream === undefined) {
      throw new Error('Expected pino’s stream on the Fastify logger');
    }
    Object.defineProperty(app.log, stream, {
      value: { write: (line: string) => this.lines.push(line) },
    });
  }
}

describe('HttpServer request logs', () => {
  let app: ZodFastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('logs request paths without their query strings', async () => {
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'info' },
      modules: [
        {
          plugin: async (scope) => {
            scope.get('/api/auth/passkey/generate-register-options', () => ({
              ok: true,
            }));
          },
        },
      ],
    }).build();
    const log = new CapturedLog();
    log.attach(app);

    const response = await app.inject({
      url: '/api/auth/passkey/generate-register-options?context=recovery-enrolment%3Asecret123',
    });
    const text = log.lines.join('');

    expect(response.statusCode).toBe(200);
    expect(text).toContain('incoming request');
    expect(text).toContain(
      '"url":"/api/auth/passkey/generate-register-options"',
    );
    expect(text).not.toContain('secret123');
    expect(text).not.toContain('recovery-enrolment');
    expect(text).not.toContain('context=');
  });
});
