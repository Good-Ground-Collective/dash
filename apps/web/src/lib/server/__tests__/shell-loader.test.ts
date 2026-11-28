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

/** Answers the session lookup with `response`, the recovery code status with `recoveryCodes` and the open Needs you items with `needsYou`. */
class CountingFetch {
  calls = 0;
  private readonly response: () => Response;
  private readonly recoveryCodes: () => Response;
  private readonly needsYou: () => Response;
  private readonly sessions: () => Response;

  constructor(props: {
    response: () => Response;
    recoveryCodes?: () => Response;
    needsYou?: () => Response;
    sessions?: () => Response;
  }) {
    this.response = props.response;
    this.recoveryCodes =
      props.recoveryCodes ?? (() => Response.json(confirmedCodes));
    this.needsYou = props.needsYou ?? (() => Response.json({ items: [] }));
    this.sessions = props.sessions ?? (() => Response.json({ sessions: [] }));
  }

  readonly fetch: typeof fetch = async (input) => {
    this.calls += 1;
    const { pathname } = new URL(String(input));
    if (pathname === '/api/auth/recovery-codes/status') {
      return this.recoveryCodes();
    }
    if (pathname === '/api/needs-you') return this.needsYou();
    if (pathname === '/api/agents/sessions') return this.sessions();
    return this.response();
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
      needsYou: [],
      needsYouSessions: [],
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
      viewer: {
        ...viewer,
        theme: 'characters',
        colorMode: null,
        timeZone: 'America/New_York',
      },
      recoveryCodes: confirmedCodes,
      needsYou: [],
      needsYouSessions: [],
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
      needsYou: [],
      needsYouSessions: [],
      appearance: lightCharacters,
      build,
    });
    expect(counter.calls).toBe(3);
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
});

describe('ShellLoader recovery code failures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops the status quietly for an expired session cookie', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const counter = new CountingFetch({
      response: () => Response.json(null),
      recoveryCodes: () =>
        Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }),
    });

    const data = await shellLoader.load(
      ShellVisit.event({ fetch: counter.fetch, hasSessionCookie: true }),
    );

    expect(data.viewer).toBeNull();
    expect(data.recoveryCodes).toBeNull();
    expect(warn).not.toHaveBeenCalled();
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

const waitingItem = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  reportedBy: '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099',
  sessionId: 'session-1',
  agentId: 'hooks-builder',
  kind: 'needs_input',
  question: { text: 'Which outbox path?' },
  openedAt: '2026-11-27T12:00:00.000Z',
  resolvedAt: null,
};

const waitingSession = {
  reportedBy: waitingItem.reportedBy,
  sessionId: 'session-1',
  reporterName: 'studio-mini',
  benchId: 'studio-mini',
  harness: 'claude-code',
  parent: { machine: 'studio-mini' },
};

describe('ShellLoader needs you', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the open items with the shell so the count is right on first paint', async () => {
    const counter = new CountingFetch({
      response: () => Response.json(ada),
      needsYou: () => Response.json({ items: [waitingItem] }),
      sessions: () => Response.json({ sessions: [waitingSession] }),
    });

    const data = await shellLoader.load(
      ShellVisit.event({ fetch: counter.fetch, hasSessionCookie: true }),
    );

    expect(data.needsYouSessions).toEqual([waitingSession]);
    expect(data.needsYou).toHaveLength(1);
    expect(data.needsYou[0]).toMatchObject({
      id: waitingItem.id,
      kind: 'needs_input',
      question: { text: 'Which outbox path?' },
      openedAt: new Date('2026-11-27T12:00:00.000Z'),
    });
  });

  it('shows nothing for a session cookie Mission Control no longer knows', async () => {
    const counter = new CountingFetch({
      response: () => Response.json(null),
      needsYou: () => Response.json({ items: [waitingItem] }),
    });

    const data = await shellLoader.load(
      ShellVisit.event({ fetch: counter.fetch, hasSessionCookie: true }),
    );

    expect(data.needsYou).toEqual([]);
  });
});
