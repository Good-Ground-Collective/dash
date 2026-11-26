import { describe, expect, it } from 'vitest';
import { ApiClient } from '#lib/api/api-client.ts';
import { ApiError } from '#lib/api/api-error.ts';

class RecordingFetch {
  readonly calls: { url: string; init: RequestInit | undefined }[] = [];
  private readonly response: Response;

  constructor(props: { response: Response }) {
    this.response = props.response;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), init });
    return this.response;
  };
}

describe('ApiClient', () => {
  it('returns the signed-in viewer and sends credentials', async () => {
    const recorder = new RecordingFetch({
      response: Response.json({
        session: { id: 's1' },
        user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
      }),
    });
    const api = new ApiClient({
      baseUrl: 'https://api.example.test',
      fetch: recorder.fetch,
    });

    await expect(api.getViewer()).resolves.toEqual({
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
    const recorder = new RecordingFetch({ response: Response.json(null) });
    const api = new ApiClient({
      baseUrl: 'https://api.example.test',
      fetch: recorder.fetch,
    });

    await expect(api.getViewer()).resolves.toBeNull();
  });

  it('throws an ApiError for a non-2xx answer', async () => {
    const recorder = new RecordingFetch({
      response: new Response('nope', { status: 503 }),
    });
    const api = new ApiClient({
      baseUrl: 'https://api.example.test',
      fetch: recorder.fetch,
    });

    await expect(api.getViewer()).rejects.toBeInstanceOf(ApiError);
  });
});
