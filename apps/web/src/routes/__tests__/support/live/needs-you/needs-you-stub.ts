import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  NeedsYouItems,
  type StubNeedsYouItem,
  type StubSession,
} from './needs-you-items.ts';

const scenarioSchema = z.enum(['empty', 'one', 'several']);

const scenarioItems = {
  empty: [],
  one: ['outbox'],
  several: ['outbox', 'options', 'markup', 'silent'],
} satisfies Record<z.infer<typeof scenarioSchema>, string[]>;

/** The shared event stream the stub publishes on. */
interface NeedsYouEvents {
  publish(frame: { type: string; data: object }): void;
}

interface StubJson {
  status: number;
  body: object;
}

const itemNameSchema = z.enum(NeedsYouItems.NAMES);

/**
 * Mission Control's `GET /api/needs-you` for `MissionControlStub`, with `needs-you.opened` and
 * `needs-you.resolved` on the shared event stream. `POST /api/needs-you/__stub/scenario?name=`
 * sets the open items to `empty`, `one` or `several` without any event, `POST
 * /api/needs-you/__stub/open?item=` opens a named item as a heartbeat would, `POST
 * /api/needs-you/__stub/resolve?item=` resolves it, and `POST /api/needs-you/__stub/fail` makes
 * the next list answer 503 once.
 */
export class NeedsYouStub {
  private open = new Map<string, StubNeedsYouItem>();
  private failNext = false;
  private readonly events: NeedsYouEvents;

  constructor(props: { events: NeedsYouEvents }) {
    this.events = props.events;
  }

  reset(): void {
    this.open = new Map();
    this.failNext = false;
  }

  /** The sessions behind the open items that have one, for the Agents stub to list. */
  reportedSessions(): StubSession[] {
    return [...this.open.values()].flatMap((item) => {
      const session = NeedsYouItems.sessionOf(item);
      return session === null ? [] : [session];
    });
  }

  serve(props: {
    response: ServerResponse;
    url: URL;
    signedIn: boolean;
  }): void {
    const reply = this.route(props);
    props.response.writeHead(reply.status, {
      'content-type': 'application/json',
    });
    props.response.end(JSON.stringify(reply.body));
  }

  private route(props: { url: URL; signedIn: boolean }): StubJson {
    const { pathname, searchParams } = props.url;
    if (pathname === '/api/needs-you/__stub/scenario') {
      const name = scenarioSchema.parse(searchParams.get('name'));
      this.open = new Map(
        scenarioItems[name].map((item, index) => {
          const entry = NeedsYouItems.named(item, { minutesAgo: 4 + index });
          return [entry.id, entry];
        }),
      );
      return { status: 200, body: { scenario: name } };
    }
    if (pathname === '/api/needs-you/__stub/open') {
      return { status: 200, body: { opened: this.opens(searchParams) } };
    }
    if (pathname === '/api/needs-you/__stub/resolve') {
      return { status: 200, body: { resolved: this.resolves(searchParams) } };
    }
    if (pathname === '/api/needs-you/__stub/fail') {
      this.failNext = true;
      return { status: 200, body: { failing: true } };
    }
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    if (this.failNext) {
      this.failNext = false;
      return { status: 503, body: { code: 'UNAVAILABLE' } };
    }
    const items = [...this.open.values()].toSorted((left, right) =>
      right.openedAt.localeCompare(left.openedAt),
    );
    return { status: 200, body: { items } };
  }

  private opens(searchParams: URLSearchParams): string {
    const name = itemNameSchema.parse(searchParams.get('item'));
    const item = NeedsYouItems.named(name, { minutesAgo: 0 });
    this.open.set(item.id, item);
    this.events.publish({ type: 'needs-you.opened', data: item });
    return item.id;
  }

  private resolves(searchParams: URLSearchParams): string {
    const name = itemNameSchema.parse(searchParams.get('item'));
    const { id } = NeedsYouItems.named(name, { minutesAgo: 0 });
    const item = this.open.get(id);
    if (item === undefined) return 'nothing open';

    this.open.delete(id);
    this.events.publish({
      type: 'needs-you.resolved',
      data: { ...item, resolvedAt: new Date().toISOString() },
    });
    return id;
  }
}
