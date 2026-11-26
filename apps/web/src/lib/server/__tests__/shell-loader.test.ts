import { describe, expect, it } from 'vitest';
import { ShellLoader } from '#lib/server/shell-loader.ts';

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

const shellLoader = new ShellLoader({ apiBaseUrl: 'https://api.example.test' });
const themePreference = { theme: 'characters', mode: 'light' } as const;

describe('ShellLoader', () => {
  it('skips Mission Control when the visitor has no session cookie', async () => {
    const counter = new CountingFetch({ response: () => Response.json(null) });

    await expect(
      shellLoader.load({
        fetch: counter.fetch,
        locals: { hasSessionCookie: false, themePreference },
      }),
    ).resolves.toEqual({ viewer: null });
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
        locals: { hasSessionCookie: true, themePreference },
      }),
    ).resolves.toEqual({ viewer });
  });

  it('falls back to no viewer when Mission Control fails', async () => {
    const counter = new CountingFetch({
      response: () => new Response('down', { status: 503 }),
    });

    await expect(
      shellLoader.load({
        fetch: counter.fetch,
        locals: { hasSessionCookie: true, themePreference },
      }),
    ).resolves.toEqual({ viewer: null });
    expect(counter.calls).toBe(1);
  });

  it('refuses an API base URL that is not a URL', () => {
    expect(() => new ShellLoader({ apiBaseUrl: 'not a url' })).toThrow();
  });
});
