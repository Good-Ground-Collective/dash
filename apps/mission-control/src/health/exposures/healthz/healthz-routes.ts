import {
  type BuildInfo,
  type HealthReport,
  healthReportSchema,
} from '#src/health/contracts/health-report.ts';
import type { HealthCheck } from '#src/health/services/health-check/health-check.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

export class HealthzRoutes {
  private readonly healthCheck: HealthCheck;
  private readonly build: BuildInfo | undefined;

  constructor(props: {
    healthCheck: HealthCheck;
    build?: BuildInfo | undefined;
  }) {
    this.healthCheck = props.healthCheck;
    this.build = props.build;
  }

  register(app: ZodFastifyInstance): void {
    app.get(
      '/healthz',
      {
        logLevel: 'warn',
        schema: {
          response: { 200: healthReportSchema, 503: healthReportSchema },
        },
      },
      async (_request, reply) => {
        const report = await this.healthCheck.run();
        return reply
          .code(report.status === 'ok' ? 200 : 503)
          .send({ ...report, ...this.buildFields() });
      },
    );
  }

  private buildFields(): Pick<HealthReport, 'version' | 'commit'> {
    if (this.build === undefined) return {};
    const { version, commit } = this.build;
    return commit === null ? { version } : { version, commit };
  }
}
