import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewer } from '#lib/api/mission-control.ts';
import type { AuthPageLoadEvent } from '#lib/server/auth-page-loader.ts';
import { MissionControlHomeLoader } from '#lib/server/home-loader.ts';

const ada: Viewer = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  theme: 'characters',
  colorMode: null,
};

const checklist = {
  items: [
    { id: 'connectGitHub', done: true },
    { id: 'secondPasskey', done: false },
  ],
};

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

  get event(): AuthPageLoadEvent {
    return {
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
  it('reads the setup checklist and the GitHub feed for a signed-in person', async () => {
    const visit = new HomeVisit({
      viewer: ada,
      answers: {
        '/onboarding/checklist': () => Response.json(checklist),
        '/integrations/github/feed': () => Response.json(feed),
      },
    });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist,
      github: { status: 'loaded', feed },
    });
    expect(visit.requested.toSorted()).toEqual([
      '/integrations/github/feed',
      '/onboarding/checklist',
    ]);
  });

  it('keeps the checklist when only the feed fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const visit = new HomeVisit({
      viewer: ada,
      answers: { '/onboarding/checklist': () => Response.json(checklist) },
    });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist,
      github: { status: 'failed' },
    });
  });

  it('asks nothing for a signed-out visitor', async () => {
    const visit = new HomeVisit({ viewer: null });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist: null,
      github: null,
    });
    expect(visit.requested).toEqual([]);
  });

  it('leaves the card out and marks the feed failed when Mission Control is down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const visit = new HomeVisit({ viewer: ada });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist: null,
      github: { status: 'failed' },
    });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
