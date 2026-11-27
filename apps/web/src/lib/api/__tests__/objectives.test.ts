import { describe, expect, it } from 'vitest';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { HttpObjectives } from '#lib/api/objectives.ts';

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

const overlay = {
  id: 'E_1',
  parked: false,
  manualProgress: 40,
  priority: null,
  dueDate: null,
};

describe('HttpObjectives', () => {
  it('lists objectives with the statuses asked for, under the base path', async () => {
    const recording = new RecordingFetch({
      response: () => Response.json({ connections: [], initiatives: [] }),
    });
    const client = new HttpObjectives({
      baseUrl: 'https://api.example.test/mc',
      fetch: recording.fetch,
    });

    await expect(
      client.list({ statuses: ['active', 'parked'] }),
    ).resolves.toEqual({ connections: [], initiatives: [] });
    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/mc/objectives?status=active%2Cparked',
    );
    expect(recording.calls[0]?.init?.credentials).toBe('include');
  });

  it('patches the overlay with the change as JSON', async () => {
    const recording = new RecordingFetch({
      response: () => Response.json(overlay),
    });
    const client = new HttpObjectives({
      baseUrl: 'https://api.example.test',
      fetch: recording.fetch,
    });

    await expect(
      client.editOverlay({ id: 'E_1', changes: { manualProgress: 40 } }),
    ).resolves.toEqual(overlay);
    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/objectives/E_1/overlay',
    );
    expect(recording.calls[0]?.init?.method).toBe('PATCH');
    expect(recording.calls[0]?.init?.body).toBe('{"manualProgress":40}');
  });

  it('rejects with Mission Control’s code', async () => {
    const client = new HttpObjectives({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({
        response: () =>
          Response.json({ code: 'TRACKER_OWNS_FIELD' }, { status: 409 }),
      }).fetch,
    });

    const failure = client.editOverlay({
      id: 'E_1',
      changes: { priority: 'P1' },
    });

    await expect(failure).rejects.toBeInstanceOf(MissionControlError);
    await expect(failure).rejects.toMatchObject({
      status: 409,
      code: 'TRACKER_OWNS_FIELD',
    });
  });
});
