import { PassThrough } from 'node:stream';

import type { LiveEvent } from '#src/live/contracts/live-event.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

const keepAliveMilliseconds = 15_000;
const maxBufferedBytes = 1024 * 1024;

/**
 * `GET /events`: a Server-Sent Events stream of live updates for the browser. A client that
 * falls more than `maxBufferedBytes` behind is disconnected, and `EventSource` reconnects.
 */
export class EventsRoutes {
  private readonly closers = new Set<() => void>();
  private readonly liveEvents: LiveEvents;

  constructor(props: { liveEvents: LiveEvents }) {
    this.liveEvents = props.liveEvents;
  }

  register(app: ZodFastifyInstance): void {
    app.addHook('preClose', async () => {
      for (const close of this.closers) {
        close();
      }
    });

    app.get('/events', (request, reply) => {
      const stream = new PassThrough();
      stream.write('retry: 5000\n\n');

      const unsubscribe = this.liveEvents.subscribe((event) => {
        this.send(stream, this.format(event));
      });
      const keepAlive = setInterval(() => {
        this.send(stream, ': keep-alive\n\n');
      }, keepAliveMilliseconds);

      const close = (): void => {
        this.closers.delete(close);
        clearInterval(keepAlive);
        unsubscribe();
        stream.end();
      };
      this.closers.add(close);
      request.raw.once('close', close);
      stream.once('close', close);

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

  private send(stream: PassThrough, chunk: string): void {
    if (stream.writableLength > maxBufferedBytes) {
      stream.destroy();
      return;
    }
    stream.write(chunk);
  }
}
