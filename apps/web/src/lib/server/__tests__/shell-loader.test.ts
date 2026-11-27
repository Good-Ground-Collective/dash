import { describe, expect, it } from 'vitest';
import { EnvironmentBuildStamp } from '#lib/build/build-stamp.ts';
import { MissionControlShellLoader } from '#lib/server/shell-loader.ts';

class CountingFetch {
  calls = 0;
  private readonly response: () => Response;

  constructor(props: { response: () => Response }) {
    this.response = props.response;
  }

  readonly fetch: typeof fetch = async () => {
    this.calls += 1;
    return this.response();
  };
}

const build = EnvironmentBuildStamp.from({
  version: 'v1.1.1',
  commit: '7615036f0c2b9a8e1d4f5a6b7c8d9e0f1a2b3c4d',
});

const shellLoader = new MissionControlShellLoader({
  apiBaseUrl: 'https://api.example.test',
  build,
});

describe('ShellLoader', () => {
  it('skips Mission Control when the visitor has no session cookie', async () => {
    const counter = new CountingFetch({ response: () => Response.json(null) });

    await expect(
      shellLoader.load({
        fetch: counter.fetch,
        locals: { hasSessionCookie: false },
      }),
    ).resolves.toEqual({ viewer: null, build });
    expect(counter.calls).toBe(0);
  });

  it('returns the viewer Mission Control reports', async () => {
    const viewer = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' };
    const counter = new CountingFetch({
      response: () => Response.json({ user: viewer }),
    });

    await expect(
      shellLoader.load({
        fetch: counter.fetch,
        locals: { hasSessionCookie: true },
      }),
    ).resolves.toEqual({ viewer, build });
  });

  it('falls back to no viewer when Mission Control fails', async () => {
    const counter = new CountingFetch({
      response: () => new Response('down', { status: 503 }),
    });

    await expect(
      shellLoader.load({
        fetch: counter.fetch,
        locals: { hasSessionCookie: true },
      }),
    ).resolves.toEqual({ viewer: null, build });
    expect(counter.calls).toBe(1);
  });

  it('refuses an API base URL that is not a URL', () => {
    expect(
      () => new MissionControlShellLoader({ apiBaseUrl: 'not a url', build }),
    ).toThrow();
  });
});
