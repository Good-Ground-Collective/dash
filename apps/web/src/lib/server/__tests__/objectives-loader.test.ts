import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MissionControlObjectivesLoader,
  type ObjectivesLoadEvent,
} from '#lib/server/objectives-loader.ts';

const initiative = {
  id: 'PVT_1',
  connectionId: 'c-acme',
  title: 'Launch',
  url: 'https://github.com/orgs/acme/projects/1',
  status: 'parked',
  priority: null,
  dueDate: null,
  progress: { source: 'none' },
  lastActivityAt: '2026-11-27T09:00:00.000Z',
  latestUpdate: null,
  nextTicket: null,
  hints: [],
  epics: [],
};

const connection = {
  id: 'c-acme',
  accountLogin: 'acme',
  lastSyncedAt: '2026-11-27T11:55:00.000Z',
  lastError: null,
  truncated: false,
};

/** One page load, answering `/objectives` by the statuses asked for. */
class ObjectivesVisit {
  readonly asked: string[] = [];
  private readonly answer: (statuses: string) => Response;
  private readonly href: string;

  constructor(props: { href: string; answer: (statuses: string) => Response }) {
    this.href = props.href;
    this.answer = props.answer;
  }

  get event(): ObjectivesLoadEvent {
    return {
      url: new URL(this.href, 'http://localhost'),
      fetch: async (input) => {
        const statuses = new URL(String(input)).searchParams.get('status');
        this.asked.push(statuses ?? '');
        return this.answer(statuses ?? '');
      },
    };
  }
}

const loader = new MissionControlObjectivesLoader({
  apiBaseUrl: 'https://api.example.test',
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlObjectivesLoader', () => {
  it('asks for active objectives by default and the statuses `show` adds', async () => {
    const answer = (): Response =>
      Response.json({ connections: [connection], initiatives: [initiative] });
    const plain = new ObjectivesVisit({ href: '/', answer });
    const shown = new ObjectivesVisit({ href: '/?show=parked', answer });

    const read = await loader.read(plain.event);
    await loader.read(shown.event);

    expect(plain.asked).toEqual(['active']);
    expect(shown.asked).toEqual(['active,parked']);
    expect(read).toMatchObject({ status: 'loaded', anyInitiative: true });
  });

  it('asks again for every status when the filtered list is empty', async () => {
    const visit = new ObjectivesVisit({
      href: '/',
      answer: (statuses) =>
        Response.json({
          connections: [connection],
          initiatives: statuses === 'active' ? [] : [initiative],
        }),
    });

    const read = await loader.read(visit.event);

    expect(visit.asked).toEqual(['active', 'active,parked,done']);
    expect(read).toMatchObject({ status: 'loaded', anyInitiative: true });
  });

  it('doesn’t ask twice when every status is already shown', async () => {
    const visit = new ObjectivesVisit({
      href: '/?show=parked,done',
      answer: () => Response.json({ connections: [], initiatives: [] }),
    });

    const read = await loader.read(visit.event);

    expect(visit.asked).toEqual(['active,parked,done']);
    expect(read).toMatchObject({ anyInitiative: false });
  });

  it('reports a failed read without failing the page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const visit = new ObjectivesVisit({
      href: '/',
      answer: () => new Response('down', { status: 503 }),
    });

    await expect(loader.read(visit.event)).resolves.toEqual({
      status: 'failed',
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
