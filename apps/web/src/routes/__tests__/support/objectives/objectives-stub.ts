import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  acmeConnectionId,
  ObjectivesItems,
  type StubObjective,
  type StubOverlay,
} from './objectives-items.ts';

const scenarioSchema = z.enum([
  'not-connected',
  'first-sync',
  'empty',
  'populated',
  'failing',
]);

const overlayBodySchema = z.strictObject({
  parked: z.boolean().optional(),
  manualProgress: z.number().int().min(0).max(100).nullable().optional(),
  priority: z.enum(['P1', 'P2', 'P3']).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
});

type Scenario = z.infer<typeof scenarioSchema>;

interface StubJson {
  status: number;
  body: object;
}

/**
 * Mission Control's `GET /objectives` and `PATCH /objectives/:id/overlay` for `MissionControlStub`.
 * Until a scenario is picked, objectives follow GitHub: none while it isn't connected, the
 * populated tracker once it is. `POST /objectives/__stub/scenario?name=…` picks one, and
 * `POST /objectives/__stub/claim?id=…` makes the tracker set that item's priority, as if
 * someone set it in GitHub after the page loaded.
 */
export class ObjectivesStub {
  private readonly githubConnected: () => boolean;
  private scenario: Scenario | null = null;
  private overlays = new Map<string, StubOverlay>();
  private claimed = new Set<string>();

  constructor(props: { githubConnected: () => boolean }) {
    this.githubConnected = props.githubConnected;
  }

  reset(): void {
    this.scenario = null;
    this.overlays = new Map();
    this.claimed = new Set();
  }

  /** Whether any initiative exists in any status, as the setup checklist asks. */
  anyInitiative(): boolean {
    return this.current() === 'populated';
  }

  /** `body` is the request's, already read. */
  serve(props: {
    body: string;
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

  private route(props: {
    body: string;
    url: URL;
    signedIn: boolean;
  }): StubJson {
    const { url } = props;
    if (url.pathname === '/objectives/__stub/scenario') {
      this.scenario = scenarioSchema.parse(url.searchParams.get('name'));
      return { status: 200, body: { scenario: this.scenario } };
    }
    if (url.pathname === '/objectives/__stub/claim') {
      this.claimed.add(url.searchParams.get('id') ?? '');
      return { status: 200, body: { claimed: [...this.claimed] } };
    }
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    if (this.current() === 'failing') {
      return { status: 503, body: { code: 'UNAVAILABLE' } };
    }

    const overlay = /^\/objectives\/(?<id>[^/]+)\/overlay$/u.exec(url.pathname);
    if (overlay?.groups?.['id'] !== undefined) {
      return this.edit(overlay.groups['id'], props.body);
    }
    const statuses = (url.searchParams.get('status') ?? 'active').split(',');
    return { status: 200, body: this.list(statuses) };
  }

  private list(statuses: readonly string[]) {
    const scenario = this.current();
    if (scenario === 'not-connected') {
      return { connections: [], initiatives: [] };
    }
    const connection = {
      id: acmeConnectionId,
      accountLogin: 'acme-labs',
      lastSyncedAt: scenario === 'first-sync' ? null : ObjectivesItems.ago(6),
      lastError: null,
      truncated: scenario === 'first-sync' ? null : false,
    };
    const items = scenario === 'populated' ? ObjectivesItems.initiatives() : [];
    const shown = (wire: { status: string }) => statuses.includes(wire.status);
    const initiatives = items
      .map((item) => ({
        ...this.wire(item),
        epics: (item.epics ?? [])
          .map((epic) => ({
            ...this.wire(epic),
            tasks: ObjectivesItems.tasks(epic),
            dueAfterInitiative: epic.dueAfterInitiative ?? false,
          }))
          .filter(shown),
      }))
      .filter(shown);
    return { connections: [connection], initiatives };
  }

  private edit(id: string, body: string): StubJson {
    const known = ObjectivesItems.initiatives()
      .flatMap((item) => [item, ...(item.epics ?? [])])
      .find((item) => item.id === id);
    if (known === undefined || this.current() !== 'populated') {
      return { status: 404, body: { code: 'OBJECTIVE_NOT_FOUND' } };
    }
    const changes = overlayBodySchema.parse(JSON.parse(body || '{}'));
    const owned =
      ((changes.priority ?? null) !== null &&
        (known.priority !== null || this.claimed.has(id))) ||
      ((changes.dueDate ?? null) !== null && known.dueDate !== null) ||
      ((changes.manualProgress ?? null) !== null && known.progress !== null);
    if (owned) {
      return { status: 409, body: { code: 'TRACKER_OWNS_FIELD' } };
    }

    const before = this.overlays.get(id);
    const kept = <T>(next: T | undefined, previous: T): T =>
      next === undefined ? previous : next;
    const saved: StubOverlay = {
      parked: kept(changes.parked, before?.parked ?? false),
      manualProgress: kept(
        changes.manualProgress,
        before?.manualProgress ?? null,
      ),
      priority: kept(changes.priority, before?.priority ?? null),
      dueDate: kept(changes.dueDate, before?.dueDate ?? null),
    };
    this.overlays.set(id, saved);
    return { status: 200, body: { id, ...saved } };
  }

  private wire(item: StubObjective) {
    return ObjectivesItems.wire({
      item,
      overlay: this.overlays.get(item.id),
      claimed: this.claimed.has(item.id),
    });
  }

  private current(): Scenario {
    if (this.scenario !== null) return this.scenario;
    return this.githubConnected() ? 'populated' : 'not-connected';
  }
}
