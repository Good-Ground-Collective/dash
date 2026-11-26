import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { EventsRoutes } from '#src/live/exposures/events/events-routes.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

/** Live updates for the browser over Server-Sent Events. */
export class LiveModule implements HttpModule {
  readonly plugin: FastifyPluginAsyncZod;

  constructor(props: { liveEvents: LiveEvents }) {
    const routes = new EventsRoutes({ liveEvents: props.liveEvents });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }
}
