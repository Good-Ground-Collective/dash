import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewer } from '#lib/api/mission-control.ts';
import type { AuthPageLoadEvent } from '#lib/server/auth-page-loader.ts';
import { MissionControlSettingsLoader } from '#lib/server/settings-loader.ts';

const ada: Viewer = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  theme: 'characters',
  colorMode: null,
  timeZone: 'America/New_York',
};

const feed = {
  connections: [],
  reviewRequests: [],
  myPullRequests: [],
  failedRuns: [],
  assignedIssues: [],
};

const briefings = {
  configured: true,
  latest: null,
  lastRun: null,
  history: [],
  budget: {
    month: '2026-11',
    spentUsd: 1.5,
    capUsd: 100,
    runs: 3,
    reached: false,
  },
  running: null,
};

class Visit {
  static of(answers: Record<string, () => Response>): AuthPageLoadEvent {
    return {
      parent: async () => ({ viewer: ada, recoveryCodes: null }),
      fetch: async (input) => {
        const answer = answers[new URL(String(input)).pathname];
        return answer === undefined
          ? new Response('down', { status: 503 })
          : answer();
      },
    };
  }
}

const loader = new MissionControlSettingsLoader({
  apiBaseUrl: 'https://api.example.test',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlSettingsLoader', () => {
  it('adds the GitHub feed to the settings data', async () => {
    const event = Visit.of({
      '/api/auth/passkey/list-user-passkeys': () => Response.json([]),
      '/integrations/github/feed': () => Response.json(feed),
      '/briefings': () => Response.json(briefings),
    });

    await expect(loader.load(event)).resolves.toEqual({
      viewer: ada,
      passkeys: [],
      github: { status: 'loaded', feed },
      briefing: { status: 'loaded', briefings },
    });
  });

  it('keeps the rest of settings when the feed fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const event = Visit.of({
      '/api/auth/passkey/list-user-passkeys': () => Response.json([]),
    });

    await expect(loader.load(event)).resolves.toMatchObject({
      passkeys: [],
      github: { status: 'failed' },
    });
  });
});
