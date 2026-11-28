import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import { EventsRoutes } from '#src/live/exposures/events/events-routes.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

const liveModulePropsSchema = z.object({
  liveEvents: z.custom<LiveEvents>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
  sessionCheckMilliseconds: z.int().positive().optional(),
});

/** Live updates for a signed-in person's browser over Server-Sent Events. */
export class LiveModule implements HttpModule {
  readonly plugin: FastifyPluginAsyncZod;

  constructor(input: z.input<typeof liveModulePropsSchema>) {
    const props = liveModulePropsSchema.parse(input);
    const routes = new EventsRoutes({
      liveEvents: props.liveEvents,
      identity: props.identity,
      sessionCheckMilliseconds: props.sessionCheckMilliseconds,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }
}
