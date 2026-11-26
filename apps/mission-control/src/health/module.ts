import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { HealthzRoutes } from '#src/health/exposures/healthz/healthz-routes.ts';
import { HealthCheck } from '#src/health/services/health-check/health-check.ts';
import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

/** `GET /healthz`: 200 when every probe passes, 503 otherwise. */
export class HealthModule implements HttpModule {
  readonly plugin: FastifyPluginAsyncZod;

  constructor(props: { probes: readonly HealthProbe[] }) {
    const routes = new HealthzRoutes({
      healthCheck: new HealthCheck({ probes: props.probes }),
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }
}
