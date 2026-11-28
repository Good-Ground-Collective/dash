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
  recentMerges: [],
  releases: [],
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

  static signedOut(fetched: string[]): AuthPageLoadEvent {
    return {
      parent: async () => ({ viewer: null, recoveryCodes: null }),
      fetch: async (input) => {
        fetched.push(new URL(String(input)).pathname);
        return Response.json([]);
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
  it('gives every section the signed-in viewer', async () => {
    await expect(loader.viewer(Visit.of({}))).resolves.toEqual({
      viewer: ada,
    });
  });

  it('loads only the passkeys for the passkeys section', async () => {
    const fetched: string[] = [];
    const event = Visit.of({
      '/api/auth/passkey/list-user-passkeys': () => {
        fetched.push('passkeys');
        return Response.json([]);
      },
      '/integrations/github/feed': () => {
        fetched.push('feed');
        return Response.json(feed);
      },
      '/briefings': () => {
        fetched.push('briefings');
        return Response.json(briefings);
      },
    });

    await expect(loader.passkeys(event)).resolves.toEqual({ passkeys: [] });
    expect(fetched).toEqual(['passkeys']);
  });

  it('loads the GitHub feed for the connections section', async () => {
    const event = Visit.of({
      '/integrations/github/feed': () => Response.json(feed),
    });

    await expect(loader.github(event)).resolves.toEqual({
      github: { status: 'loaded', feed },
    });
  });

  it('keeps the connections section when the feed fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(loader.github(Visit.of({}))).resolves.toMatchObject({
      github: { status: 'failed' },
    });
  });
});

describe('MissionControlSettingsLoader briefing and sign-in', () => {
  it('sends a signed-in viewer from /settings to the first section', async () => {
    await expect(loader.index(Visit.of({}))).rejects.toMatchObject({
      status: 307,
      location: '/settings/profile',
    });
  });

  it('loads the briefing for the spend section', async () => {
    const event = Visit.of({
      '/briefings': () => Response.json(briefings),
    });

    await expect(loader.briefing(event)).resolves.toEqual({
      briefing: { status: 'loaded', briefings },
    });
  });

  it('keeps the spend section when the briefing fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(loader.briefing(Visit.of({}))).resolves.toEqual({
      briefing: { status: 'failed' },
    });
  });

  it.each(['index', 'viewer', 'passkeys', 'github', 'briefing'] as const)(
    'sends a signed-out visitor to sign in from %s without reading anything',
    async (section) => {
      const fetched: string[] = [];

      await expect(
        loader[section](Visit.signedOut(fetched)),
      ).rejects.toMatchObject({ status: 303, location: '/sign-in' });
      expect(fetched).toEqual([]);
    },
  );
});
