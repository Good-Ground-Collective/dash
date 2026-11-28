import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewer } from '#lib/api/mission-control.ts';
import type { AuthPageLoadEvent } from '#lib/server/auth-page-loader.ts';
import { MissionControlAgentSessionsLoader } from '#lib/server/agents/agent-sessions-loader.ts';

const ada: Viewer = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  theme: 'characters',
  colorMode: null,
  timeZone: 'America/New_York',
};

class Visit {
  static of(props: {
    viewer: Viewer | null;
    answer: () => Response;
  }): AuthPageLoadEvent & { requested: string[] } {
    const requested: string[] = [];
    return {
      requested,
      parent: async () => ({ viewer: props.viewer, recoveryCodes: null }),
      fetch: async (input) => {
        requested.push(new URL(String(input)).pathname);
        return props.answer();
      },
    };
  }
}

const loader = new MissionControlAgentSessionsLoader({
  apiBaseUrl: 'https://api.example.test',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlAgentSessionsLoader', () => {
  it('reads the sessions for a signed-in person', async () => {
    const event = Visit.of({
      viewer: ada,
      answer: () => Response.json({ sessions: [] }),
    });

    await expect(loader.page(event)).resolves.toEqual({
      agents: { status: 'loaded', sessions: [] },
    });
    expect(event.requested).toEqual(['/api/agents/sessions']);
  });

  it('sends a signed-out visitor to sign in without asking Mission Control', async () => {
    const event = Visit.of({
      viewer: null,
      answer: () => Response.json({ sessions: [] }),
    });

    await expect(loader.page(event)).rejects.toMatchObject({
      status: 303,
      location: '/sign-in',
    });
    expect(event.requested).toEqual([]);
  });

  it('still renders the page when Mission Control fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const event = Visit.of({
      viewer: ada,
      answer: () => Response.json({ code: 'UNAVAILABLE' }, { status: 503 }),
    });

    await expect(loader.page(event)).resolves.toEqual({
      agents: { status: 'failed' },
    });
  });
});
