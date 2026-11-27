import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { z } from 'zod';

import type { BuildInfo } from '#src/health/contracts/health-report.ts';
import { HealthzRoutes } from '#src/health/exposures/healthz/healthz-routes.ts';
import {
  type probeHealthCheckPropsSchema,
  ProbeHealthCheck,
} from '#src/health/services/health-check/health-check.ts';
import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

/** `GET /healthz`: 200 when every probe passes, 503 otherwise. With `build`, it also reports the version and commit. */
export class HealthModule implements HttpModule {
  readonly plugin: FastifyPluginAsyncZod;

  constructor(
    props: { probes: readonly HealthProbe[]; build?: BuildInfo } & z.input<
      typeof probeHealthCheckPropsSchema
    >,
  ) {
    const routes = new HealthzRoutes({
      healthCheck: new ProbeHealthCheck(props),
      build: props.build,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }
}
