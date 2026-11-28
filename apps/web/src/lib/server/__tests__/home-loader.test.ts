import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewer } from '#lib/api/mission-control.ts';
import {
  type HomeLoadEvent,
  MissionControlHomeLoader,
} from '#lib/server/home-loader.ts';

const ada: Viewer = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  theme: 'characters',
  colorMode: null,
  timeZone: 'America/New_York',
};

const checklist = { items: [{ id: 'connectGitHub', done: false }] };

const objectives = { connections: [], initiatives: [] };

const feed = {
  connections: [],
  reviewRequests: [],
  myPullRequests: [],
  failedRuns: [],
  assignedIssues: [],
};

class HomeVisit {
  readonly requested: string[] = [];
  private readonly viewer: Viewer | null;
  private readonly answers: Record<string, () => Response>;

  constructor(props: {
    viewer: Viewer | null;
    answers?: Record<string, () => Response>;
  }) {
    this.viewer = props.viewer;
    this.answers = props.answers ?? {};
  }

  get event(): HomeLoadEvent {
    return {
      url: new URL('http://localhost/'),
      parent: async () => ({ viewer: this.viewer, recoveryCodes: null }),
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        this.requested.push(path);
        const answer = this.answers[path];
        return answer === undefined
          ? new Response('down', { status: 503 })
          : answer();
      },
    };
  }
}

const loader = new MissionControlHomeLoader({
  apiBaseUrl: 'https://api.example.test',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlHomeLoader', () => {
  it('reads the setup checklist, objectives and the GitHub feed for a signed-in person', async () => {
    const visit = new HomeVisit({
      viewer: ada,
      answers: {
        '/onboarding/checklist': () => Response.json(checklist),
        '/integrations/github/feed': () => Response.json(feed),
        '/objectives': () => Response.json(objectives),
      },
    });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist,
      github: { status: 'loaded', feed },
      objectives: {
        status: 'loaded',
        objectives,
        anyInitiative: false,
        githubConnected: false,
      },
    });
    expect(visit.requested.toSorted()).toEqual([
      '/integrations/github/feed',
      '/objectives',
      '/objectives',
      '/onboarding/checklist',
    ]);
  });
});

describe('MissionControlHomeLoader, whether GitHub is connected', () => {
  it('counts GitHub as connected when the checklist says so, before objectives list the connection', async () => {
    const visit = new HomeVisit({
      viewer: ada,
      answers: {
        '/onboarding/checklist': () =>
          Response.json({ items: [{ id: 'connectGitHub', done: true }] }),
        '/integrations/github/feed': () => Response.json(feed),
        '/objectives': () => Response.json(objectives),
      },
    });

    const data = await loader.load(visit.event);

    expect(data.objectives).toMatchObject({ githubConnected: true });
  });

  it('counts GitHub as connected when the feed lists a connection', async () => {
    const connected = {
      ...feed,
      connections: [
        {
          id: 'c1',
          accountLogin: 'acme',
          kind: 'owned',
          lastSyncedAt: null,
          lastError: null,
          truncated: null,
        },
      ],
    };
    const visit = new HomeVisit({
      viewer: ada,
      answers: {
        '/integrations/github/feed': () => Response.json(connected),
        '/objectives': () => Response.json(objectives),
      },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const data = await loader.load(visit.event);

    expect(data.objectives).toMatchObject({ githubConnected: true });
  });
});

describe('MissionControlHomeLoader when reads fail', () => {
  it('keeps the checklist when the feed and objectives fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const visit = new HomeVisit({
      viewer: ada,
      answers: { '/onboarding/checklist': () => Response.json(checklist) },
    });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist,
      github: { status: 'failed' },
      objectives: { status: 'failed' },
    });
  });

  it('asks nothing for a signed-out visitor', async () => {
    const visit = new HomeVisit({ viewer: null });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist: null,
      github: null,
      objectives: null,
    });
    expect(visit.requested).toEqual([]);
  });

  it('leaves the card out and marks the feed failed when Mission Control is down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const visit = new HomeVisit({ viewer: ada });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist: null,
      github: { status: 'failed' },
      objectives: { status: 'failed' },
    });
    expect(warn).toHaveBeenCalledTimes(3);
  });
});
