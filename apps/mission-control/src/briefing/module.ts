import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import { BriefingRoutes } from '#src/briefing/exposures/briefing-routes/briefing-routes.ts';
import type { BriefingRepository } from '#src/briefing/repositories/briefings/briefing-repository.ts';
import type { OwnerTimeZoneReader } from '#src/briefing/repositories/owner-time-zones/owner-time-zone-reader.ts';
import type { BriefingWorkflows } from '#src/briefing/services/briefing-workflows/briefing-workflows.ts';
import { DbosBriefingRetention } from '#src/briefing/services/briefing-retention/briefing-retention.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';
import type { BriefingSettings } from '#src/platform/definitions/config/app-config.ts';

const briefingModulePropsSchema = z.object({
  briefings: z.custom<BriefingRepository>(),
  ownerTimeZone: z.custom<OwnerTimeZoneReader>(),
  workflows: z.custom<BriefingWorkflows>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
  settings: z.custom<BriefingSettings>().nullable(),
});

/**
 * The AI briefing: its scheduled and on-demand runs, every run kept for 30 days, the daily
 * clean-up of older runs, `GET /briefings` and `POST /briefing/regenerate`. Old runs expire
 * whether or not OpenAI is configured.
 */
export class BriefingModule implements HttpModule, WorkflowModule {
  readonly plugin: FastifyPluginAsyncZod;
  private readonly retention: DbosBriefingRetention;
  private readonly workflows: BriefingWorkflows;

  constructor(input: z.input<typeof briefingModulePropsSchema>) {
    const props = briefingModulePropsSchema.parse(input);
    this.workflows = props.workflows;
    this.retention = new DbosBriefingRetention({
      briefings: props.briefings,
      ownerTimeZone: props.ownerTimeZone,
    });
    const routes = new BriefingRoutes({
      briefings: props.briefings,
      ownerTimeZone: props.ownerTimeZone,
      workflows: props.workflows,
      settings: props.settings,
      identity: props.identity,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }

  async activate(): Promise<void> {
    await this.retention.activate();
    await this.workflows.activate();
  }

  registerWorkflows(): void {
    this.retention.registerWorkflows();
    this.workflows.registerWorkflows();
  }
}
