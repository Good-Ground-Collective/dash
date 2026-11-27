import { PassThrough } from 'node:stream';

import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import { SignedInPerson } from '#src/auth/services/signed-in-person/signed-in-person.ts';
import type { LiveEvent } from '#src/live/contracts/live-event.ts';
import { LiveEventsSignInRequiredError } from '#src/live/errors.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

const eventsRoutesPropsSchema = z.object({
  liveEvents: z.custom<LiveEvents>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
  sessionCheckMilliseconds: z.int().positive().default(60_000),
});

const keepAliveMilliseconds = 15_000;
const maxBufferedBytes = 1024 * 1024;

/**
 * `GET /events`: a Server-Sent Events stream of live updates for a signed-in person's browser.
 * Events carry what the person-only read APIs answer, so API keys and anonymous callers are
 * refused. The session is checked again every `sessionCheckMilliseconds` while the stream is
 * open, and the stream ends once the person is no longer signed in, so a signed-out or revoked
 * tab stops receiving events and its `EventSource` reconnects into a 401. A client that falls
 * more than `maxBufferedBytes` behind is disconnected, and `EventSource` reconnects.
 */
export class EventsRoutes {
  private readonly closers = new Set<() => void>();
  private readonly liveEvents: LiveEvents;
  private readonly person: SignedInPerson;
  private readonly sessionCheckMilliseconds: number;

  constructor(props: z.input<typeof eventsRoutesPropsSchema>) {
    const parsed = eventsRoutesPropsSchema.parse(props);
    this.liveEvents = parsed.liveEvents;
    this.person = new SignedInPerson({ identity: parsed.identity });
    this.sessionCheckMilliseconds = parsed.sessionCheckMilliseconds;
  }

  register(app: ZodFastifyInstance): void {
    app.addHook('preClose', async () => {
      for (const close of this.closers) {
        close();
      }
    });

    app.get('/events', async (request, reply) => {
      if ((await this.person.of(request)) === null) {
        throw new LiveEventsSignInRequiredError();
      }
      return this.stream(request, reply);
    });
  }

  private stream(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    const stream = new PassThrough();
    stream.write('retry: 5000\n\n');

    const unsubscribe = this.liveEvents.subscribe((event) => {
      this.send(stream, this.format(event));
    });
    const keepAlive = setInterval(() => {
      this.send(stream, ': keep-alive\n\n');
    }, keepAliveMilliseconds);
    const sessionCheck = setInterval(() => {
      void this.endUnlessSignedIn(request, close);
    }, this.sessionCheckMilliseconds);

    const close = (): void => {
      this.closers.delete(close);
      clearInterval(keepAlive);
      clearInterval(sessionCheck);
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
  }

  /** Calls `close` when the request's session no longer belongs to a signed-in person, or can't be checked. */
  private async endUnlessSignedIn(
    request: FastifyRequest,
    close: () => void,
  ): Promise<void> {
    const person = await this.person.of(request).catch(() => null);
    if (person === null) {
      close();
    }
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
