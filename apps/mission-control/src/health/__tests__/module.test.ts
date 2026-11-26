import { afterEach, describe, expect, it } from 'vitest';

import { HealthModule } from '#src/health/module.ts';
import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

class StubProbe implements HealthProbe {
  readonly healthy: boolean;
  readonly name: string;

  constructor(props: { name: string; healthy: boolean }) {
    this.name = props.name;
    this.healthy = props.healthy;
  }

  async check(): Promise<void> {
    if (!this.healthy) {
      throw new Error(`${this.name} is down`);
    }
  }
}

describe('HealthModule', () => {
  let app: ZodFastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns 200 when the database and workflows are healthy', async () => {
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [
        new HealthModule({
          probes: [
            new StubProbe({ name: 'database', healthy: true }),
            new StubProbe({ name: 'workflows', healthy: true }),
          ],
        }),
      ],
    }).build();

    const response = await app.inject({ url: '/healthz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok', workflows: 'ok' },
    });
  });

  it('returns 503 and names the failing probe', async () => {
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [
        new HealthModule({
          probes: [
            new StubProbe({ name: 'database', healthy: false }),
            new StubProbe({ name: 'workflows', healthy: true }),
          ],
        }),
      ],
    }).build();

    const response = await app.inject({ url: '/healthz' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'failing', workflows: 'ok' },
    });
  });
});
