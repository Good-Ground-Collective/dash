import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Viewer } from '#lib/api/mission-control.ts';
import type { AuthPageLoadEvent } from '#lib/server/auth-page-loader.ts';
import { MissionControlGithubFeedLoader } from '#lib/server/github-feed-loader.ts';

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
  defaultBranches: [],
  assignedIssues: [],
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

const loader = new MissionControlGithubFeedLoader({
  apiBaseUrl: 'https://api.example.test',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlGithubFeedLoader', () => {
  it('reads the feed for a signed-in person', async () => {
    const event = Visit.of({ viewer: ada, answer: () => Response.json(feed) });

    await expect(loader.read(event)).resolves.toEqual({
      status: 'loaded',
      feed,
    });
    expect(event.requested).toEqual(['/integrations/github/feed']);
  });

  it('asks nothing for a signed-out visitor', async () => {
    const event = Visit.of({ viewer: null, answer: () => Response.json(feed) });

    await expect(loader.read(event)).resolves.toBeNull();
    expect(event.requested).toEqual([]);
  });

  it('marks the feed failed rather than failing the page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const event = Visit.of({
      viewer: ada,
      answer: () => new Response('down', { status: 503 }),
    });

    await expect(loader.page(event)).resolves.toEqual({
      github: { status: 'failed' },
    });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('sends a signed-out visitor to sign in from the GitHub page', async () => {
    const event = Visit.of({ viewer: null, answer: () => Response.json(feed) });

    await expect(loader.page(event)).rejects.toMatchObject({
      status: 303,
      location: '/sign-in',
    });
  });
});
