import { DBOS } from '@dbos-inc/dbos-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HealthModule } from '#src/health/module.ts';
import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';
import { Versions } from '#src/platform/services/workflows/__tests__/support/workflow-launch-fixture.ts';
import { LatestVersionGauge } from '#src/platform/services/workflows/latest-version-gauge.ts';

class HealthyProbe implements HealthProbe {
  readonly name = 'database';

  async check(): Promise<void> {}
}

describe('LatestVersionGauge', () => {
  beforeEach(() => {
    vi.spyOn(DBOS, 'applicationVersion', 'get').mockReturnValue('this-deploy');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads 1 when this version holds "latest"', async () => {
    vi.spyOn(DBOS, 'getLatestApplicationVersion').mockResolvedValue(
      Versions.record('this-deploy', 2_000),
    );

    const gauge = new LatestVersionGauge();

    expect(gauge.name).toBe('holdsLatestVersion');
    expect(await gauge.read()).toBe(1);
  });

  it('reads 0 when another version holds "latest"', async () => {
    vi.spyOn(DBOS, 'getLatestApplicationVersion').mockResolvedValue(
      Versions.record('newer-deploy', 3_000),
    );

    expect(await new LatestVersionGauge().read()).toBe(0);
  });

  it('reports 0 on /healthz without failing health', async () => {
    vi.spyOn(DBOS, 'getLatestApplicationVersion').mockResolvedValue(
      Versions.record('newer-deploy', 3_000),
    );
    const app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [
        new HealthModule({
          probes: [new HealthyProbe()],
          gauges: [new LatestVersionGauge()],
        }),
      ],
    }).build();

    const response = await app.inject({ url: '/healthz' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'ok' },
      gauges: { holdsLatestVersion: 0 },
    });
  });
});
