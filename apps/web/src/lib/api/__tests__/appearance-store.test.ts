import { describe, expect, it } from 'vitest';
import { HttpAppearanceStore } from '#lib/api/appearance-store.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

class RecordingFetch {
  readonly calls: { url: string; init: RequestInit | undefined }[] = [];
  private readonly response: () => Response;

  constructor(props: { response: () => Response }) {
    this.response = props.response;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    this.calls.push({ url: String(input), init });
    return this.response();
  };
}

describe('HttpAppearanceStore', () => {
  it('posts the preference to Mission Control with credentials', async () => {
    const recorder = new RecordingFetch({
      response: () => Response.json({ theme: 'characters', mode: 'dark' }),
    });
    const store = new HttpAppearanceStore({
      baseUrl: 'https://api.example.test/base',
      fetch: recorder.fetch,
    });

    await store.save({ theme: 'characters', mode: 'dark' });

    expect(recorder.calls[0]?.url).toBe(
      'https://api.example.test/base/api/auth/appearance/update',
    );
    expect(recorder.calls[0]?.init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ theme: 'characters', mode: 'dark' }),
    });
  });

  it('rejects with Mission Control’s code when it refuses', async () => {
    const store = new HttpAppearanceStore({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({
        response: () =>
          Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }),
      }).fetch,
    });

    const saving = store.save({ theme: 'characters', mode: 'light' });

    await expect(saving).rejects.toBeInstanceOf(MissionControlError);
    await expect(saving).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });
});
