import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { HttpAgentSessions } from '#lib/agents/http-agent-sessions.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

const activity = {
  status: 'working',
  liveness: 'stale',
  livenessChangedAt: '2026-11-27T11:30:00.000+00:00',
  summary: '<b>Reading</b> the relay',
  question: null,
  error: null,
  taskId: null,
  workspace: { repository: 'dash', branch: 'main' },
  machine: 'studio-mini',
  agent: null,
  highestSeq: 3,
  startedAt: '2026-11-27T11:00:00.000+00:00',
  reportedAt: '2026-11-27T11:40:00.000+00:00',
  updatedAt: '2026-11-27T11:40:01.000+00:00',
};

const wire = {
  sessions: [
    {
      reportedBy: '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099',
      sessionId: 'session-1',
      reporterName: 'studio-hooks',
      benchId: null,
      harness: 'claude-code',
      parent: activity,
      subagents: [{ agentId: 'worker', ...activity, status: 'complete' }],
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

describe('HttpAgentSessions', () => {
  it('lists the sessions with credentials, keeping agent text verbatim', async () => {
    const recording = new RecordingFetch({
      response: () => Response.json(wire),
    });
    const reads = new HttpAgentSessions({
      baseUrl: 'https://api.example.test/mc',
      fetch: recording.fetch,
    });

    const sessions = await reads.list();

    expect(recording.calls[0]?.url).toBe(
      'https://api.example.test/mc/api/agents/sessions',
    );
    expect(recording.calls[0]?.init?.credentials).toBe('include');
    expect(sessions[0]?.parent?.summary).toBe('<b>Reading</b> the relay');
    expect(sessions[0]?.parent?.liveness).toBe('stale');
    expect(sessions[0]?.subagents[0]?.status).toBe('complete');
    expect(sessions[0]?.parent?.updatedAt).toEqual(
      new Date('2026-11-27T11:40:01.000Z'),
    );
  });

  it('rejects with Mission Control’s refusal when signed out', async () => {
    const reads = new HttpAgentSessions({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({
        response: () =>
          Response.json({ code: 'SIGN_IN_REQUIRED' }, { status: 401 }),
      }).fetch,
    });

    await expect(reads.list()).rejects.toBeInstanceOf(MissionControlError);
  });

  it('rejects a body that is not a list of sessions', async () => {
    const reads = new HttpAgentSessions({
      baseUrl: 'https://api.example.test',
      fetch: new RecordingFetch({
        response: () => Response.json({ sessions: [{ sessionId: 'x' }] }),
      }).fetch,
    });

    await expect(reads.list()).rejects.toBeInstanceOf(ZodError);
  });
});
