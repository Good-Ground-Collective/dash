import { afterEach, describe, expect, it } from 'vitest';

import { LiveModule } from '#src/live/module.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

describe('LiveModule', () => {
  let app: ZodFastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('streams published events as Server-Sent Events', async () => {
    const liveEvents = new InProcessLiveEvents();
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [new LiveModule({ liveEvents })],
    }).build();
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const abort = new AbortController();

    const response = await fetch(`${address}/events`, { signal: abort.signal });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const opening = await reader?.read();
    liveEvents.publish({ type: 'heartbeat', data: { id: 'one' } });
    const event = await reader?.read();
    abort.abort();

    expect(response.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8',
    );
    expect(decoder.decode(opening?.value)).toBe('retry: 5000\n\n');
    expect(decoder.decode(event?.value)).toBe(
      'event: heartbeat\ndata: {"id":"one"}\n\n',
    );
  });
});
