import { describe, expect, it } from 'vitest';
import { HttpMissionControl } from '#lib/api/mission-control.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

class RecordingFetch {
  readonly calls: { url: string; init: RequestInit | undefined }[] = [];
  private readonly respond: (
    init: RequestInit | undefined,
  ) => Promise<Response>;

  constructor(props: {
    respond: (init: RequestInit | undefined) => Promise<Response>;
  }) {
    this.respond = props.respond;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), init });
    return this.respond(init);
  };
}

const baseUrl = 'https://api.example.test';

describe('HttpMissionControl', () => {
  it('returns the signed-in viewer and sends credentials', async () => {
    const recorder = new RecordingFetch({
      respond: async () =>
        Response.json({
          session: { id: 's1' },
          user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
        }),
    });
    const missionControl = new HttpMissionControl({
      baseUrl,
      fetch: recorder.fetch,
    });

    await expect(missionControl.getViewer()).resolves.toEqual({
      id: 'u1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(recorder.calls[0]?.url).toBe(
      'https://api.example.test/api/auth/get-session',
    );
    expect(recorder.calls[0]?.init?.credentials).toBe('include');
  });

  it('returns null when there is no session', async () => {
    const recorder = new RecordingFetch({
      respond: async () => Response.json(null),
    });
    const missionControl = new HttpMissionControl({
      baseUrl,
      fetch: recorder.fetch,
    });

    await expect(missionControl.getViewer()).resolves.toBeNull();
  });
});

describe('HttpMissionControl failures', () => {
  it('throws a MissionControlError for a non-2xx answer', async () => {
    const recorder = new RecordingFetch({
      respond: async () => new Response('nope', { status: 503 }),
    });
    const missionControl = new HttpMissionControl({
      baseUrl,
      fetch: recorder.fetch,
    });

    await expect(missionControl.getViewer()).rejects.toBeInstanceOf(
      MissionControlError,
    );
  });

  it('rejects a session that does not match the schema', async () => {
    const recorder = new RecordingFetch({
      respond: async () => Response.json({ user: { id: 'u1' } }),
    });
    const missionControl = new HttpMissionControl({
      baseUrl,
      fetch: recorder.fetch,
    });

    await expect(missionControl.getViewer()).rejects.toThrow();
  });

  it('gives up once the timeout elapses', async () => {
    const recorder = new RecordingFetch({
      respond: async (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted after timeout'));
          });
        }),
    });
    const missionControl = new HttpMissionControl({
      baseUrl,
      fetch: recorder.fetch,
      timeoutMs: 10,
    });

    await expect(missionControl.getViewer()).rejects.toThrow(
      'aborted after timeout',
    );
  });

  it('refuses a base URL that is not a URL', () => {
    const recorder = new RecordingFetch({
      respond: async () => Response.json(null),
    });

    expect(
      () =>
        new HttpMissionControl({ baseUrl: 'not a url', fetch: recorder.fetch }),
    ).toThrow();
  });
});
