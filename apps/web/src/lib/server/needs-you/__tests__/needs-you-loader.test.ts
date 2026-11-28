import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissionControlNeedsYouLoader } from '#lib/server/needs-you/needs-you-loader.ts';

const item = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  reportedBy: '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099',
  sessionId: 'session-1',
  agentId: 'hooks-builder',
  kind: 'needs_input',
  question: { text: 'Which outbox path?' },
  openedAt: '2026-11-27T12:00:00.000Z',
  resolvedAt: null,
};

const session = {
  reportedBy: item.reportedBy,
  sessionId: 'session-1',
  reporterName: 'studio-mini',
  benchId: 'studio-mini',
  harness: 'claude-code',
  parent: { machine: 'studio-mini' },
};

class Answers {
  readonly paths: string[] = [];
  private readonly items: () => Response;
  private readonly sessions: () => Response;

  constructor(props: { items?: () => Response; sessions?: () => Response }) {
    this.items = props.items ?? (() => Response.json({ items: [item] }));
    this.sessions =
      props.sessions ?? (() => Response.json({ sessions: [session] }));
  }

  readonly fetch: typeof fetch = async (input) => {
    const { pathname } = new URL(String(input));
    this.paths.push(pathname);
    return pathname === '/api/needs-you' ? this.items() : this.sessions();
  };
}

const loader = new MissionControlNeedsYouLoader({
  apiBaseUrl: 'https://api.example.test',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlNeedsYouLoader', () => {
  it('reads the open items and the sessions they came from', async () => {
    const answers = new Answers({});

    const waiting = await loader.read({ fetch: answers.fetch });

    expect(waiting.items[0]?.question?.text).toBe('Which outbox path?');
    expect(waiting.sessions).toEqual([session]);
  });

  it('reads no sessions when nothing is waiting', async () => {
    const answers = new Answers({
      items: () => Response.json({ items: [] }),
    });

    const waiting = await loader.read({ fetch: answers.fetch });

    expect(waiting).toEqual({ items: [], sessions: [] });
    expect(answers.paths).toEqual(['/api/needs-you']);
  });

  it('still lists the items when the sessions can’t be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const answers = new Answers({
      sessions: () => new Response('down', { status: 503 }),
    });

    const waiting = await loader.read({ fetch: answers.fetch });

    expect(waiting.items).toHaveLength(1);
    expect(waiting.sessions).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it.each([
    ['can’t be listed', () => new Response('down', { status: 503 }), 1],
    ['are malformed', () => Response.json({ items: [{ id: 'nope' }] }), 1],
    [
      'are refused as signed out',
      () => Response.json({ code: 'SIGN_IN_REQUIRED' }, { status: 401 }),
      0,
    ],
  ])('shows nothing when the items %s', async (_reason, items, warnings) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const answers = new Answers({ items });

    const waiting = await loader.read({ fetch: answers.fetch });

    expect(waiting).toEqual({ items: [], sessions: [] });
    expect(warn).toHaveBeenCalledTimes(warnings);
  });
});
