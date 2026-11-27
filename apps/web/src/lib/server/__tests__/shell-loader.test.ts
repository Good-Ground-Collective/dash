import { isRedirect } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvironmentBuildStamp } from '#lib/build/build-stamp.ts';
import {
  MissionControlShellLoader,
  type ShellLoadEvent,
} from '#lib/server/shell-loader.ts';
import type { ThemePreference } from '#lib/theme/theme-preference-reader.ts';
import { RecordingCookies } from '#lib/theme/__tests__/support/recording-cookies.ts';

const confirmedCodes = { confirmed: true, remaining: 10 };

/** Answers the session lookup with `response` and the recovery code status with `recoveryCodes`. */
class CountingFetch {
  calls = 0;
  private readonly response: () => Response;
  private readonly recoveryCodes: () => Response;

  constructor(props: {
    response: () => Response;
    recoveryCodes?: () => Response;
  }) {
    this.response = props.response;
    this.recoveryCodes =
      props.recoveryCodes ?? (() => Response.json(confirmedCodes));
  }

  readonly fetch: typeof fetch = async (input) => {
    this.calls += 1;
    return new URL(String(input)).pathname === '/api/auth/recovery-codes/status'
      ? this.recoveryCodes()
      : this.response();
  };
}

const build = EnvironmentBuildStamp.from({
  version: 'v1.1.1',
  commit: '7615036f0c2b9a8e1d4f5a6b7c8d9e0f1a2b3c4d',
});

const lightCharacters: ThemePreference = { theme: 'characters', mode: 'light' };

const shellLoader = new MissionControlShellLoader({
  apiBaseUrl: 'https://api.example.test',
  build,
});

class ShellVisit {
  static event(props: {
    fetch: typeof fetch;
    hasSessionCookie: boolean;
    cookies?: RecordingCookies;
    pathname?: string;
  }): ShellLoadEvent {
    return {
      fetch: props.fetch,
      url: { pathname: props.pathname ?? '/' },
      cookies: props.cookies ?? new RecordingCookies(),
      locals: {
        hasSessionCookie: props.hasSessionCookie,
        themePreference: lightCharacters,
      },
    };
  }
}

describe('ShellLoader', () => {
  it('skips Mission Control when the visitor has no session cookie', async () => {
    const counter = new CountingFetch({ response: () => Response.json(null) });

    await expect(
      shellLoader.load(
        ShellVisit.event({ fetch: counter.fetch, hasSessionCookie: false }),
      ),
    ).resolves.toEqual({
      viewer: null,
      recoveryCodes: null,
      appearance: lightCharacters,
      build,
    });
    expect(counter.calls).toBe(0);
  });

  it('returns the viewer Mission Control reports', async () => {
    const viewer = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' };
    const counter = new CountingFetch({
      response: () => Response.json({ user: viewer }),
    });

    await expect(
      shellLoader.load(
        ShellVisit.event({ fetch: counter.fetch, hasSessionCookie: true }),
      ),
    ).resolves.toEqual({
      viewer: { ...viewer, theme: 'characters', colorMode: null },
      recoveryCodes: confirmedCodes,
      appearance: lightCharacters,
      build,
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
    const cookies = new RecordingCookies({ values: { 'dash-mode': 'light' } });
    const event = ShellVisit.event({
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
        ShellVisit.event({ fetch: counter.fetch, hasSessionCookie: true }),
      ),
    ).resolves.toEqual({
      viewer: null,
      recoveryCodes: null,
      appearance: lightCharacters,
      build,
    });
    expect(counter.calls).toBe(1);
  });

  it('refuses an API base URL that is not a URL', () => {
    expect(
      () => new MissionControlShellLoader({ apiBaseUrl: 'not a url', build }),
    ).toThrow();
  });
});

const ada = { user: { id: 'u1', name: 'Ada', email: 'ada@example.com' } };

class RedirectCatcher {
  static async location(load: Promise<unknown>): Promise<string | null> {
    try {
      await load;
      return null;
    } catch (thrown) {
      if (!isRedirect(thrown)) throw thrown;
      expect(thrown.status).toBe(303);
      return thrown.location;
    }
  }
}

describe('ShellLoader recovery codes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a viewer without confirmed codes to the codes step', async () => {
    const counter = new CountingFetch({
      response: () => Response.json(ada),
      recoveryCodes: () => Response.json({ confirmed: false, remaining: 0 }),
    });

    await expect(
      RedirectCatcher.location(
        shellLoader.load(
          ShellVisit.event({
            fetch: counter.fetch,
            hasSessionCookie: true,
            pathname: '/settings',
          }),
        ),
      ),
    ).resolves.toBe('/setup/recovery-codes');
  });

  it('renders the codes step itself for that viewer', async () => {
    const unconfirmed = { confirmed: false, remaining: 0 };
    const counter = new CountingFetch({
      response: () => Response.json(ada),
      recoveryCodes: () => Response.json(unconfirmed),
    });

    const data = await shellLoader.load(
      ShellVisit.event({
        fetch: counter.fetch,
        hasSessionCookie: true,
        pathname: '/setup/recovery-codes',
      }),
    );

    expect(data.recoveryCodes).toEqual(unconfirmed);
  });

  it('lets the viewer through when Mission Control can’t report codes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const counter = new CountingFetch({
      response: () => Response.json(ada),
      recoveryCodes: () => new Response('down', { status: 503 }),
    });

    const data = await shellLoader.load(
      ShellVisit.event({ fetch: counter.fetch, hasSessionCookie: true }),
    );

    expect(data.viewer?.name).toBe('Ada');
    expect(data.recoveryCodes).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
