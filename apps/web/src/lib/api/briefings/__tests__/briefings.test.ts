import { describe, expect, it } from 'vitest';
import type { BriefingRecord } from '#lib/api/briefings/briefing-contracts.ts';
import { HttpBriefings } from '#lib/api/briefings/briefings.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import {
  LegacyBriefings,
  SampleBriefings,
} from '#lib/briefing/__tests__/support/sample-briefings.ts';

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

describe('HttpBriefings', () => {
  it('reads GET /briefings with credentials and turns timestamps into dates', async () => {
    const recording = new RecordingFetch({
      response: () => Response.json(SampleBriefings.briefings()),
    });
    const client = new HttpBriefings({
      baseUrl: 'https://api.example.test/mc',
      fetch: recording.fetch,
    });

    const briefings = await client.latest();

    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/mc/briefings',
    );
    expect(recording.calls[0]?.init?.credentials).toBe('include');
    expect(briefings.latest?.finishedAt).toEqual(
      new Date('2026-11-27T11:40:00Z'),
    );
  });

  it('posts to /briefing/regenerate and returns the run', async () => {
    const recording = new RecordingFetch({
      response: () => Response.json({ runId: 'wf-1' }, { status: 202 }),
    });
    const client = new HttpBriefings({
      baseUrl: 'https://api.example.test',
      fetch: recording.fetch,
    });

    await expect(client.regenerate()).resolves.toEqual({ runId: 'wf-1' });
    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/briefing/regenerate',
    );
    expect(recording.calls[0]?.init?.method).toBe('POST');
  });

  it('rejects with Mission Control’s code when the briefing is not configured', async () => {
    const client = new HttpBriefings({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({
        response: () =>
          Response.json(
            { code: 'BRIEFING_NOT_CONFIGURED', message: 'No writer' },
            { status: 409 },
          ),
      }).fetch,
    });

    await expect(client.regenerate()).rejects.toMatchObject({
      status: 409,
      code: 'BRIEFING_NOT_CONFIGURED',
    });
    await expect(client.regenerate()).rejects.toBeInstanceOf(
      MissionControlError,
    );
  });
});

describe('briefing paragraphs', () => {
  it('shows a link that is not http or https as plain text', async () => {
    const briefings = SampleBriefings.briefings({
      latest: SampleBriefings.run({
        paragraphs: [[{ text: 'click', href: 'javascript:alert(1)' }]],
      }),
    });
    const client = new HttpBriefings({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({ response: () => Response.json(briefings) })
        .fetch,
    });

    const read = await client.latest();

    expect(read.latest?.paragraphs).toEqual([[{ text: 'click', href: null }]]);
  });
});

describe('briefing sections', () => {
  class Reading {
    static async of(latest: Partial<BriefingRecord>) {
      const client = new HttpBriefings({
        baseUrl: 'https://api.example.test',
        fetch: new RecordingFetch({
          response: () =>
            Response.json({ ...SampleBriefings.briefings(), latest }),
        }).fetch,
      });
      return client.latest();
    }
  }

  it('shows a link that is not http or https as plain text', async () => {
    const run = SampleBriefings.run({
      sections: {
        opening: [{ text: 'click', href: 'javascript:alert(1)' }],
        actions: [],
        closing: [{ text: 'later', href: null }],
      },
    });

    const read = await Reading.of(run);

    expect(read.latest?.sections?.opening).toEqual([
      { text: 'click', href: null },
    ]);
  });

  it('reads a run from before sections, which has none', async () => {
    const { sections: _sections, ...stored } = LegacyBriefings.run();

    const read = await Reading.of(stored);

    expect(read.latest?.sections).toBeNull();
    expect(read.latest?.paragraphs).toHaveLength(1);
  });
});
