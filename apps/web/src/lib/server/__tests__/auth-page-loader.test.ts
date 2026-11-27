import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { Viewer } from '#lib/api/mission-control.ts';
import {
  type AuthPageLoadEvent,
  MissionControlAuthPageLoader,
} from '#lib/server/auth-page-loader.ts';

const ada: Viewer = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  theme: 'characters',
  colorMode: null,
};

class PageVisit {
  readonly requested: string[] = [];
  private readonly viewer: Viewer | null;
  private readonly answers: Map<string, () => Response>;

  constructor(props: {
    viewer: Viewer | null;
    answers?: Record<string, () => Response>;
  }) {
    this.viewer = props.viewer;
    this.answers = new Map(Object.entries(props.answers ?? {}));
  }

  get event(): AuthPageLoadEvent {
    return {
      parent: async () => ({ viewer: this.viewer }),
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        this.requested.push(path);
        const answer = this.answers.get(path);
        return answer === undefined
          ? new Response('down', { status: 503 })
          : answer();
      },
    };
  }
}

class RedirectCatcher {
  static async location(load: Promise<object>): Promise<string | null> {
    try {
      await load;
      return null;
    } catch (thrown) {
      if (isRedirect(thrown)) return thrown.location;
      throw thrown;
    }
  }
}

const loader = new MissionControlAuthPageLoader({
  apiBaseUrl: 'https://api.example.test',
});

describe('MissionControlAuthPageLoader setup and sign-in', () => {
  it('reports whether setup is open', async () => {
    const visit = new PageVisit({
      viewer: null,
      answers: {
        '/api/auth/setup/status': () => Response.json({ open: true }),
      },
    });

    await expect(loader.setup(visit.event)).resolves.toEqual({ open: true });
  });

  it('says it doesn’t know when Mission Control is down', async () => {
    const visit = new PageVisit({ viewer: null });

    await expect(loader.setup(visit.event)).resolves.toEqual({ open: null });
    await expect(loader.signIn(visit.event)).resolves.toEqual({
      setupOpen: false,
    });
  });

  it('sends a signed-in visitor home from setup and sign-in', async () => {
    const visit = new PageVisit({ viewer: ada });

    expect(await RedirectCatcher.location(loader.setup(visit.event))).toBe('/');
    expect(await RedirectCatcher.location(loader.signIn(visit.event))).toBe(
      '/',
    );
    expect(visit.requested).toEqual([]);
  });
});

describe('MissionControlAuthPageLoader settings', () => {
  it('sends a signed-out visitor to sign in', async () => {
    const visit = new PageVisit({ viewer: null });

    expect(await RedirectCatcher.location(loader.settings(visit.event))).toBe(
      '/sign-in',
    );
  });

  it('lists passkeys oldest first', async () => {
    const visit = new PageVisit({
      viewer: ada,
      answers: {
        '/api/auth/passkey/list-user-passkeys': () =>
          Response.json([
            {
              id: 'p2',
              name: 'iPhone',
              createdAt: '2026-11-21T00:00:00.000Z',
              deviceType: 'multiDevice',
              backedUp: true,
            },
            {
              id: 'p1',
              name: 'MacBook Pro',
              createdAt: '2026-11-20T00:00:00.000Z',
              deviceType: 'multiDevice',
              backedUp: true,
            },
          ]),
      },
    });

    const data = await loader.settings(visit.event);

    expect(data.passkeys?.map((passkey) => passkey.id)).toEqual(['p1', 'p2']);
  });

  it('still renders settings when the list fails', async () => {
    const visit = new PageVisit({ viewer: ada });

    await expect(loader.settings(visit.event)).resolves.toEqual({
      viewer: ada,
      passkeys: null,
    });
  });
});

describe('MissionControlAuthPageLoader service accounts', () => {
  it('sends a signed-out visitor to sign in', async () => {
    const visit = new PageVisit({ viewer: null });

    expect(
      await RedirectCatcher.location(loader.serviceAccounts(visit.event)),
    ).toBe('/sign-in');
  });

  it('lists the viewer’s service accounts', async () => {
    const visit = new PageVisit({
      viewer: ada,
      answers: {
        '/api/auth/service-accounts/list': () =>
          Response.json({
            serviceAccounts: [
              {
                id: 'a1',
                kind: 'agent',
                name: 'CI reviewer',
                benchId: null,
                agentName: 'ci-reviewer',
                description: 'Runs in Actions',
                scopes: ['heartbeat:write'],
                createdAt: '2026-11-20T00:00:00.000Z',
                keys: [],
              },
            ],
          }),
      },
    });

    const data = await loader.serviceAccounts(visit.event);

    expect(data.serviceAccounts?.map((account) => account.name)).toEqual([
      'CI reviewer',
    ]);
  });

  it('still renders when the list fails', async () => {
    const visit = new PageVisit({ viewer: ada });

    await expect(loader.serviceAccounts(visit.event)).resolves.toEqual({
      viewer: ada,
      serviceAccounts: null,
    });
  });
});
