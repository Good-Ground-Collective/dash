import { afterEach, describe, expect, it } from 'vitest';

import type { Heartbeat } from '#src/heartbeat/contracts/heartbeat.ts';
import { HeartbeatModule } from '#src/heartbeat/module.ts';
import type { HeartbeatRepository } from '#src/heartbeat/repositories/heartbeats/heartbeat-repository.ts';
import type { LiveEvent } from '#src/live/contracts/live-event.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

class InMemoryHeartbeatRepository implements HeartbeatRepository {
  readonly heartbeats: Heartbeat[] = [];

  async listRecent(props: { limit: number }): Promise<Heartbeat[]> {
    return this.heartbeats.toReversed().slice(0, props.limit);
  }

  async record(props: { firedAt: Date }): Promise<Heartbeat> {
    const heartbeat = {
      id: crypto.randomUUID(),
      firedAt: props.firedAt.toISOString(),
      recordedAt: new Date().toISOString(),
    };
    this.heartbeats.push(heartbeat);
    return heartbeat;
  }
}

describe('HeartbeatModule', () => {
  let app: ZodFastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('lists recorded heartbeats, newest first, up to the limit', async () => {
    const repository = new InMemoryHeartbeatRepository();
    const module = new HeartbeatModule({
      liveEvents: new InProcessLiveEvents(),
      repository,
    });
    await module.recorder.record({ firedAt: new Date('2026-01-01T00:00:00Z') });
    await module.recorder.record({ firedAt: new Date('2026-01-01T00:00:30Z') });
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [module],
    }).build();

    const response = await app.inject({ url: '/heartbeats?limit=1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      heartbeats: [repository.heartbeats[1]],
    });
  });

  it('rejects a limit outside the allowed range', async () => {
    app = await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [
        new HeartbeatModule({
          liveEvents: new InProcessLiveEvents(),
          repository: new InMemoryHeartbeatRepository(),
        }),
      ],
    }).build();

    const response = await app.inject({ url: '/heartbeats?limit=0' });

    expect(response.statusCode).toBe(400);
  });

  it('publishes each recorded heartbeat as a live event', async () => {
    const liveEvents = new InProcessLiveEvents();
    const received: LiveEvent[] = [];
    liveEvents.subscribe((event) => received.push(event));
    const module = new HeartbeatModule({
      liveEvents,
      repository: new InMemoryHeartbeatRepository(),
    });

    const heartbeat = await module.recorder.record({ firedAt: new Date() });

    expect(received).toEqual([{ type: 'heartbeat', data: heartbeat }]);
  });
});
