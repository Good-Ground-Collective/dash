import { describe, expect, it } from 'vitest';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { HttpNeedsYou } from '#lib/needs-you/http-needs-you.ts';

const wire = {
  items: [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      reportedBy: '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099',
      sessionId: 'session-1',
      agentId: null,
      kind: 'needs_input',
      question: {
        text: '<b>Which</b> path?',
        options: [{ label: 'outbox', description: 'The default' }],
      },
      openedAt: '2026-11-27T12:00:00.000+00:00',
      resolvedAt: null,
    },
  ],
};

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

describe('HttpNeedsYou', () => {
  it('lists the open items with credentials, keeping the question verbatim', async () => {
    const recording = new RecordingFetch({
      response: () => Response.json(wire),
    });
    const needsYou = new HttpNeedsYou({
      baseUrl: 'https://api.example.test/mc',
      fetch: recording.fetch,
    });

    const items = await needsYou.listOpen();

    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/mc/api/needs-you',
    );
    expect(recording.calls[0]?.init?.credentials).toBe('include');
    expect(items[0]?.question?.text).toBe('<b>Which</b> path?');
    expect(items[0]?.openedAt).toEqual(new Date('2026-11-27T12:00:00.000Z'));
  });

  it('rejects with Mission Control’s refusal when signed out', async () => {
    const needsYou = new HttpNeedsYou({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({
        response: () =>
          Response.json({ code: 'SIGN_IN_REQUIRED' }, { status: 401 }),
      }).fetch,
    });

    await expect(needsYou.listOpen()).rejects.toBeInstanceOf(
      MissionControlError,
    );
  });

  it('lists the sessions, dropping what the page does not use', async () => {
    const recording = new RecordingFetch({
      response: () =>
        Response.json({
          sessions: [
            {
              reportedBy: '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099',
              sessionId: 'session-1',
              reporterName: 'studio-mini',
              benchId: null,
              harness: 'claude-code',
              parent: { machine: 'studio-mini', status: 'working' },
              subagents: [],
            },
          ],
        }),
    });
    const needsYou = new HttpNeedsYou({
      baseUrl: 'https://api.example.test',
      fetch: recording.fetch,
    });

    const sessions = await needsYou.listSessions();

    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/api/agents/sessions',
    );
    expect(sessions[0]?.parent).toEqual({ machine: 'studio-mini' });
  });
});
