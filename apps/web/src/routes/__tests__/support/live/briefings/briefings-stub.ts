import type { ServerResponse } from 'node:http';
import { z } from 'zod';
import { BriefingsItems, regeneratedBriefingId } from './briefings-items.ts';

const scenarioSchema = z.enum([
  'none',
  'ready',
  'failed-run',
  'over-budget',
  'unconfigured',
  'failing',
]);

const stagesAfterStart = ['writing', 'saving'] as const;

type Scenario = z.infer<typeof scenarioSchema>;

interface StubJson {
  status: number;
  body: object;
}

/** The shared event stream the stub publishes on and reports about. */
interface BriefingEvents {
  publish(frame: { type: string; data: object }): void;
  count(): number;
  drop(): void;
}

interface StubRun {
  runId: string;
  next: number;
}

/**
 * Mission Control's `GET /briefings` and `POST /briefing/regenerate` for `MissionControlStub`,
 * publishing its progress on the shared event stream. Until a scenario is picked the briefing is not configured.
 * `POST /briefing/__stub/scenario?name=…` picks one, `POST /briefing/__stub/start` begins a run as
 * a schedule would, and `POST /briefing/__stub/advance` sends the running run's next stage and
 * finally its `briefing.ready`, which swaps in a new briefing. `POST /briefing/__stub/replace`
 * changes the briefing without any event, `POST /briefing/__stub/drop` ends every open stream, and
 * `GET /briefing/__stub/listeners` counts the open streams.
 */
export class BriefingsStub {
  private scenario: Scenario = 'unconfigured';
  private regenerated = false;
  private run: StubRun | null = null;
  private runs = 0;
  private readonly events: BriefingEvents;

  constructor(props: { events: BriefingEvents }) {
    this.events = props.events;
  }

  reset(): void {
    this.scenario = 'unconfigured';
    this.regenerated = false;
    this.run = null;
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
    if (pathname === '/briefing/__stub/scenario') {
      this.scenario = scenarioSchema.parse(searchParams.get('name'));
      this.regenerated = false;
      this.run = null;
      return { status: 200, body: { scenario: this.scenario } };
    }
    if (pathname === '/briefing/__stub/listeners') {
      return { status: 200, body: { count: this.events.count() } };
    }
    if (pathname === '/briefing/__stub/replace') {
      this.regenerated = true;
      return { status: 200, body: { replaced: true } };
    }
    if (pathname === '/briefing/__stub/drop') {
      this.events.drop();
      return { status: 200, body: { dropped: true } };
    }
    if (pathname === '/briefing/__stub/start') {
      return { status: 202, body: this.start() };
    }
    if (pathname === '/briefing/__stub/advance') {
      return { status: 200, body: { sent: this.advance() } };
    }
    if (!props.signedIn) {
      return { status: 401, body: { code: 'SIGN_IN_REQUIRED' } };
    }
    if (this.scenario === 'failing') {
      return { status: 503, body: { code: 'UNAVAILABLE' } };
    }
    if (pathname === '/briefing/regenerate') {
      return this.regenerate();
    }
    return { status: 200, body: this.briefings() };
  }

  private regenerate(): StubJson {
    if (this.scenario === 'unconfigured') {
      return {
        status: 409,
        body: { code: 'BRIEFING_NOT_CONFIGURED', message: 'No writer' },
      };
    }
    return { status: 202, body: this.run ?? this.start() };
  }

  private start() {
    this.runs += 1;
    const run = { runId: `run-${this.runs}`, next: 0 };
    this.run = run;
    this.events.publish({
      type: 'briefing.progress',
      data: { runId: run.runId, stage: 'snapshot' },
    });
    return { runId: run.runId };
  }

  private advance(): string {
    const { run } = this;
    if (run === null) return 'nothing running';

    const stage = stagesAfterStart[run.next];
    if (stage !== undefined) {
      run.next += 1;
      this.events.publish({
        type: 'briefing.progress',
        data: { runId: run.runId, stage },
      });
      return stage;
    }
    this.regenerated = true;
    this.run = null;
    this.events.publish({
      type: 'briefing.ready',
      data: {
        runId: run.runId,
        briefingId: regeneratedBriefingId,
        status: 'succeeded',
      },
    });
    return 'ready';
  }

  private briefings() {
    const running =
      this.run === null
        ? null
        : { runId: this.run.runId, startedAt: BriefingsItems.ago(0) };
    const common = { configured: true, history: [], running };
    const reached = this.scenario === 'over-budget';
    const budget = BriefingsItems.budget({
      spentUsd: reached ? 100 : 12.4,
      reached,
    });

    if (this.scenario === 'unconfigured') {
      return {
        ...common,
        configured: false,
        latest: null,
        lastRun: null,
        budget,
      };
    }
    if (this.regenerated) {
      const fresh = BriefingsItems.fresh();
      return { ...common, latest: fresh, lastRun: fresh, budget };
    }
    const good = BriefingsItems.good(20);
    if (this.scenario === 'none') {
      return { ...common, latest: null, lastRun: null, budget };
    }
    if (this.scenario === 'failed-run') {
      return {
        ...common,
        latest: good,
        lastRun: BriefingsItems.failed(),
        budget,
      };
    }
    if (reached) {
      return {
        ...common,
        latest: good,
        lastRun: BriefingsItems.skipped(),
        budget,
      };
    }
    return { ...common, latest: good, lastRun: good, budget };
  }
}
