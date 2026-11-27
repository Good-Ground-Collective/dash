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

class HomeVisit {
  readonly requested: string[] = [];
  private readonly viewer: Viewer | null;
  private readonly answer: (() => Response) | undefined;

  constructor(props: { viewer: Viewer | null; answer?: () => Response }) {
    this.viewer = props.viewer;
    this.answer = props.answer;
  }

  get event(): AuthPageLoadEvent {
    return {
      parent: async () => ({ viewer: this.viewer, recoveryCodes: null }),
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        this.requested.push(path);
        return path === '/onboarding/checklist' && this.answer !== undefined
          ? this.answer()
          : new Response('down', { status: 503 });
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
  it('reads the setup checklist in one call for a signed-in person', async () => {
    const visit = new HomeVisit({
      viewer: ada,
      answer: () => Response.json(checklist),
    });

    await expect(loader.load(visit.event)).resolves.toEqual({ checklist });
    expect(visit.requested).toEqual(['/onboarding/checklist']);
  });

  it('asks nothing for a signed-out visitor', async () => {
    const visit = new HomeVisit({ viewer: null });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist: null,
    });
    expect(visit.requested).toEqual([]);
  });

  it('leaves the card out when Mission Control is down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const visit = new HomeVisit({ viewer: ada });

    await expect(loader.load(visit.event)).resolves.toEqual({
      checklist: null,
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
