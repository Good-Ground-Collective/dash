import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import { BriefingRoutes } from '#src/briefing/exposures/briefing-routes/briefing-routes.ts';
import type { BriefingRepository } from '#src/briefing/repositories/briefings/briefing-repository.ts';
import type { OwnerTimeZoneReader } from '#src/briefing/repositories/owner-time-zones/owner-time-zone-reader.ts';
import { DbosBriefingRetention } from '#src/briefing/services/briefing-retention/briefing-retention.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';
import type { BriefingSettings } from '#src/platform/definitions/config/app-config.ts';

const briefingModulePropsSchema = z.object({
  briefings: z.custom<BriefingRepository>(),
  ownerTimeZone: z.custom<OwnerTimeZoneReader>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
  settings: z.custom<BriefingSettings>().nullable(),
});

/**
 * The AI briefing: every run kept for 30 days, the daily clean-up of older runs, and
 * `GET /briefings`. Old runs expire whether or not OpenAI is configured.
 */
export class BriefingModule implements HttpModule, WorkflowModule {
  readonly plugin: FastifyPluginAsyncZod;
  private readonly retention: DbosBriefingRetention;

  constructor(input: z.input<typeof briefingModulePropsSchema>) {
    const props = briefingModulePropsSchema.parse(input);
    this.retention = new DbosBriefingRetention({
      briefings: props.briefings,
      ownerTimeZone: props.ownerTimeZone,
    });
    const routes = new BriefingRoutes({
      briefings: props.briefings,
      ownerTimeZone: props.ownerTimeZone,
      settings: props.settings,
      identity: props.identity,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }

  async activate(): Promise<void> {
    await this.retention.activate();
  }

  registerWorkflows(): void {
    this.retention.registerWorkflows();
  }
}
