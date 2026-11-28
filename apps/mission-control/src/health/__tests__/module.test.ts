import { afterEach, describe, expect, it } from 'vitest';

import { HealthModule } from '#src/health/module.ts';
import type { HealthGauge } from '#src/platform/contracts/health-gauge.ts';
import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

class HungProbe implements HealthProbe {
  readonly name = 'database';

  async check(): Promise<void> {
    await new Promise<never>(() => {});
  }
}

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

describe('HealthModule probe timeout', () => {
  let app: ZodFastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('counts a probe that never answers as failing', async () => {
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [
        new HealthModule({
          probes: [new HungProbe()],
          timeoutMilliseconds: 20,
        }),
      ],
    }).build();

    const response = await app.inject({ url: '/healthz' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'unavailable',
      checks: { database: 'failing' },
    });
  });
});

describe('HealthModule build fields', () => {
  let app: ZodFastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  const healthz = async (build: { version: string; commit: string | null }) => {
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [
        new HealthModule({
          probes: [new StubProbe({ name: 'database', healthy: true })],
          build,
        }),
      ],
    }).build();
    return app.inject({ url: '/healthz' });
  };

  it('reports the version and commit it was given', async () => {
    const commit = '7615036f0c2b9a8e1d4f5a6b7c8d9e0f1a2b3c4d';
    const response = await healthz({ version: 'v1.1.1', commit });

    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
      version: 'v1.1.1',
      commit,
    });
  });

  it('leaves out an unknown commit', async () => {
    const response = await healthz({ version: 'dev', commit: null });

    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
      version: 'dev',
    });
  });
});

class StubGauge implements HealthGauge {
  readonly name = 'strandedWorkflows';
  readonly count: number | null;

  constructor(props: { count: number | null }) {
    this.count = props.count;
  }

  async read(): Promise<number> {
    if (this.count === null) {
      throw new Error('workflows are unreachable');
    }
    return this.count;
  }
}

describe('HealthModule gauges', () => {
  let app: ZodFastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  const healthz = async (count: number | null) => {
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [
        new HealthModule({
          probes: [new StubProbe({ name: 'database', healthy: true })],
          gauges: [new StubGauge({ count })],
        }),
      ],
    }).build();
    return app.inject({ url: '/healthz' });
  };

  it('reports stranded work without failing health', async () => {
    const response = await healthz(3);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
      gauges: { strandedWorkflows: 3 },
    });
  });

  it('leaves out a gauge it could not read, without failing health', async () => {
    const response = await healthz(null);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
    });
  });
});
