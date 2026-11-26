import { PassThrough } from 'node:stream';

import type { LiveEvent } from '#src/live/contracts/live-event.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

const keepAliveMilliseconds = 15_000;

/** `GET /events`: a Server-Sent Events stream of live updates for the browser. */
export class EventsRoutes {
  private readonly liveEvents: LiveEvents;

  constructor(props: { liveEvents: LiveEvents }) {
    this.liveEvents = props.liveEvents;
  }

  register(app: ZodFastifyInstance): void {
    app.get('/events', (request, reply) => {
      const stream = new PassThrough();
      stream.write('retry: 5000\n\n');
      const unsubscribe = this.liveEvents.subscribe((event) => {
        stream.write(this.format(event));
      });
      const keepAlive = setInterval(() => {
        stream.write(': keep-alive\n\n');
      }, keepAliveMilliseconds);
      request.raw.once('close', () => {
        clearInterval(keepAlive);
        unsubscribe();
        stream.end();
      });
      return reply
        .headers({
          'cache-control': 'no-cache',
          'content-type': 'text/event-stream; charset=utf-8',
          'x-accel-buffering': 'no',
        })
        .send(stream);
    });
  }

  private format(event: LiveEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }
}
