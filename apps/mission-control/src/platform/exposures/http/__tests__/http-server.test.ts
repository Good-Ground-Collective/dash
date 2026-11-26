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
