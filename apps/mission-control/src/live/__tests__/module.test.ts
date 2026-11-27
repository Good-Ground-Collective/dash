import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  harnessWebOrigin,
  ServiceAccountHarness,
} from '#src/auth/__tests__/support/service-account-harness.ts';
import { LiveModule } from '#src/live/module.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

const sessionCheckMilliseconds = 1_000;

const liveHarnessPropsSchema = z.object({
  accounts: z.instanceof(ServiceAccountHarness),
  liveEvents: z.instanceof(InProcessLiveEvents),
  app: z.custom<ZodFastifyInstance>(),
  address: z.url(),
  cookie: z.string().min(1),
  apiKey: z.string().min(1),
});

/** Mission Control with auth and live events, listening on a free port, with a signed-in person's cookie and an agent's API key. Sessions are checked every `sessionCheckMilliseconds`. */
class LiveHarness {
  readonly accounts: ServiceAccountHarness;
  readonly liveEvents: InProcessLiveEvents;
  readonly app: ZodFastifyInstance;
  readonly address: string;
  readonly cookie: string;
  readonly apiKey: string;

  private constructor(props: z.input<typeof liveHarnessPropsSchema>) {
    const parsed = liveHarnessPropsSchema.parse(props);
    this.accounts = parsed.accounts;
    this.liveEvents = parsed.liveEvents;
    this.app = parsed.app;
    this.address = parsed.address;
    this.cookie = parsed.cookie;
    this.apiKey = parsed.apiKey;
  }

  async open(props: {
    headers: Record<string, string>;
    signal?: AbortSignal;
  }): Promise<Response> {
    return fetch(`${this.address}/events`, {
      headers: props.headers,
      signal: props.signal ?? null,
    });
  }

  static async start(): Promise<LiveHarness> {
    const accounts = new ServiceAccountHarness();
    const liveEvents = new InProcessLiveEvents();
    const app = await new HttpServer({
      config: {
        corsOrigins: [harnessWebOrigin],
        environment: 'test',
        logLevel: 'silent',
      },
      modules: [
        accounts.auth,
        new LiveModule({
          liveEvents,
          identity: accounts.auth.identity,
          sessionCheckMilliseconds,
        }),
      ],
    }).build();
    const cookie = await accounts.signIn();
    const created = await accounts.createAccount({
      cookie,
      account: {
        kind: 'agent',
        name: 'CI reviewer',
        agentName: 'ci-reviewer',
        description: 'Runs in GitHub Actions',
        scopes: ['heartbeat:write'],
      },
    });

    return new LiveHarness({
      accounts,
      liveEvents,
      app,
      address: await app.listen({ host: '127.0.0.1', port: 0 }),
      cookie,
      apiKey: created.apiKey.secret,
    });
  }
}

let served: LiveHarness | undefined;

afterEach(async () => {
  vi.useRealTimers();
  await served?.app.close();
  served = undefined;
});

describe('LiveModule', () => {
  it.each([
    ['an API key', true],
    ['no session', false],
  ])('answers 401 to %s', async (_label, withKey) => {
    served = await LiveHarness.start();
    const headers = withKey ? { authorization: `Bearer ${served.apiKey}` } : {};

    const response = await served.open({ headers });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  });

  it('streams published events to a signed-in person as Server-Sent Events', async () => {
    served = await LiveHarness.start();
    const abort = new AbortController();

    const response = await served.open({
      headers: { cookie: served.cookie },
      signal: abort.signal,
    });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const opening = await reader?.read();
    served.liveEvents.publish({ type: 'heartbeat', data: { id: 'one' } });
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

  it('ends open streams so the server can close', async () => {
    served = await LiveHarness.start();
    const response = await served.open({ headers: { cookie: served.cookie } });
    const reader = response.body?.getReader();
    await reader?.read();

    await served.app.close();
    const end = await reader?.read();
    served = undefined;

    expect(end?.done).toBe(true);
  });
});

describe('LiveModule session checks', () => {
  it('keeps a stream open while the person stays signed in', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    served = await LiveHarness.start();
    const response = await served.open({ headers: { cookie: served.cookie } });
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    await reader?.read();

    await vi.advanceTimersByTimeAsync(sessionCheckMilliseconds * 3);
    served.liveEvents.publish({ type: 'heartbeat', data: { id: 'two' } });
    const event = await reader?.read();
    await reader?.cancel();

    expect(decoder.decode(event?.value)).toBe(
      'event: heartbeat\ndata: {"id":"two"}\n\n',
    );
  });

  it('ends an open stream at the next session check after the person signs out', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    served = await LiveHarness.start();
    const response = await served.open({ headers: { cookie: served.cookie } });
    const reader = response.body?.getReader();
    await reader?.read();

    const signOut = await served.accounts.post({
      path: '/sign-out',
      cookie: served.cookie,
      body: {},
    });
    await vi.advanceTimersByTimeAsync(sessionCheckMilliseconds);
    const end = await reader?.read();

    expect(signOut.ok).toBe(true);
    expect(end?.done).toBe(true);
  });
});
