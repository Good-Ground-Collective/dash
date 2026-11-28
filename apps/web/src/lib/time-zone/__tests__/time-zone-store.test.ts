import { describe, expect, it } from 'vitest';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { HttpTimeZoneStore } from '#lib/time-zone/time-zone-store.ts';

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

describe('HttpTimeZoneStore', () => {
  it('posts the zone to Mission Control with credentials', async () => {
    const recorder = new RecordingFetch({
      response: () => Response.json({ timeZone: 'Europe/London' }),
    });
    const store = new HttpTimeZoneStore({
      baseUrl: 'https://api.example.test/base',
      fetch: recorder.fetch,
    });

    await store.save('Europe/London');

    expect(recorder.calls[0]?.url).toBe(
      'https://api.example.test/base/api/people/me/time-zone',
    );
    expect(recorder.calls[0]?.init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ timeZone: 'Europe/London' }),
    });
  });

  it('rejects with Mission Control’s code when it refuses', async () => {
    const store = new HttpTimeZoneStore({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({
        response: () =>
          Response.json({ code: 'TIME_ZONE_REJECTED' }, { status: 400 }),
      }).fetch,
    });

    const saving = store.save('Mars/Olympus_Mons');

    await expect(saving).rejects.toBeInstanceOf(MissionControlError);
    await expect(saving).rejects.toMatchObject({
      status: 400,
      code: 'TIME_ZONE_REJECTED',
    });
  });
});
