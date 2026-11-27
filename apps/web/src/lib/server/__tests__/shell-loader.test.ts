import { describe, expect, it } from 'vitest';
import {
  MissionControlShellLoader,
  type ShellLoadEvent,
} from '#lib/server/shell-loader.ts';
import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';

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

class RecordingCookies {
  readonly written = new Map<string, string>();
  private readonly values: Map<string, string>;

  constructor(values: Record<string, string> = {}) {
    this.values = new Map(Object.entries(values));
  }

  readonly get = (name: string): string | undefined => this.values.get(name);
  readonly set = (name: string, value: string): void => {
    this.written.set(name, value);
  };
}

const lightCharacters: ThemePreference = { theme: 'characters', mode: 'light' };

const shellLoader = new MissionControlShellLoader({
  apiBaseUrl: 'https://api.example.test',
});

class ShellVisit {
  static event(props: {
    fetch: typeof fetch;
    hasSessionCookie: boolean;
    cookies?: RecordingCookies;
  }): ShellLoadEvent {
    return {
      fetch: props.fetch,
      cookies: props.cookies ?? new RecordingCookies(),
      locals: {
        hasSessionCookie: props.hasSessionCookie,
        themePreference: lightCharacters,
      },
    };
  }
}

const loadEvent = ShellVisit.event.bind(ShellVisit);

describe('ShellLoader', () => {
  it('skips Mission Control when the visitor has no session cookie', async () => {
    const counter = new CountingFetch({ response: () => Response.json(null) });

    await expect(
      shellLoader.load(
        loadEvent({ fetch: counter.fetch, hasSessionCookie: false }),
      ),
    ).resolves.toEqual({ viewer: null, appearance: lightCharacters });
    expect(counter.calls).toBe(0);
  });

  it('returns the viewer Mission Control reports', async () => {
    const viewer = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' };
    const counter = new CountingFetch({
      response: () => Response.json({ user: viewer }),
    });

    await expect(
      shellLoader.load(
        loadEvent({ fetch: counter.fetch, hasSessionCookie: true }),
      ),
    ).resolves.toEqual({
      viewer: { ...viewer, theme: 'characters', colorMode: null },
      appearance: lightCharacters,
    });
  });
});

describe('ShellLoader appearance', () => {
  it('renders in the viewer’s saved mode and mirrors it into the cookie', async () => {
    const counter = new CountingFetch({
      response: () =>
        Response.json({
          user: {
            id: 'u1',
            name: 'Ada',
            email: 'ada@example.com',
            theme: 'characters',
            colorMode: 'dark',
          },
        }),
    });
    const cookies = new RecordingCookies({ 'dash-mode': 'light' });
    const event = loadEvent({
      fetch: counter.fetch,
      hasSessionCookie: true,
      cookies,
    });

    const data = await shellLoader.load(event);

    expect(data.appearance).toEqual({ theme: 'characters', mode: 'dark' });
    expect(event.locals.themePreference).toEqual(data.appearance);
    expect(cookies.written).toEqual(
      new Map([
        ['dash-theme', 'characters'],
        ['dash-mode', 'dark'],
      ]),
    );
  });
});

describe('ShellLoader failures', () => {
  it('falls back to no viewer when Mission Control fails', async () => {
    const counter = new CountingFetch({
      response: () => new Response('down', { status: 503 }),
    });

    await expect(
      shellLoader.load(
        loadEvent({ fetch: counter.fetch, hasSessionCookie: true }),
      ),
    ).resolves.toEqual({ viewer: null, appearance: lightCharacters });
    expect(counter.calls).toBe(1);
  });

  it('refuses an API base URL that is not a URL', () => {
    expect(
      () => new MissionControlShellLoader({ apiBaseUrl: 'not a url' }),
    ).toThrow();
  });
});
