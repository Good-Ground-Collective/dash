import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';

import {
  FixedOwnerTimeZone,
  InMemoryBriefingRepository,
} from '#src/briefing/__tests__/support/in-memory-briefings.ts';
import { SampleSnapshot } from '#src/briefing/__tests__/support/sample-snapshot.ts';
import type { BriefingSnapshotDigest } from '#src/briefing/contracts/briefing-snapshot.ts';
import type { BriefingWritten } from '#src/briefing/contracts/briefing-written.ts';
import type { PersonTimeZoneReader } from '#src/briefing/repositories/people-time-zones/person-time-zone-reader.ts';
import type { BriefingSnapshot } from '#src/briefing/services/briefing-snapshot/briefing-snapshot.ts';
import { DbosBriefingWorkflows } from '#src/briefing/services/briefing-workflows/briefing-workflows.ts';
import type { BriefingWriter } from '#src/briefing/services/briefing-writer/briefing-writer.ts';
import type { LiveEvent } from '#src/live/contracts/live-event.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

export const settle = { timeout: 15_000, interval: 100 };
export const worstCaseMicroUsd = 400_000;
export const prices = {
  inputUsdPerMTok: 0.1,
  cachedInputUsdPerMTok: 0.01,
  outputUsdPerMTok: 0.5,
};

export const written: BriefingWritten = {
  paragraphs: [
    {
      segments: [
        { text: 'Review ', url: null },
        { text: 'the pull request', url: 'https://github.com/acme/web/pull/7' },
      ],
    },
  ],
  unknownRefs: 0,
  model: 'gpt-test',
  tokens: { input: 1000, cachedInput: 0, output: 200, reasoning: 0 },
  costMicroUsd: 250,
  prices,
};

class RecordedSnapshot implements BriefingSnapshot {
  async of(): Promise<BriefingSnapshotDigest> {
    return SampleSnapshot.build();
  }
}

/** Writes what the test queued, and while held each write waits for the test to release it. */
export class ScriptedWriter implements BriefingWriter {
  calls = 0;
  held = false;
  private readonly outcomes: (BriefingWritten | Error)[] = [];
  private readonly holds: PromiseWithResolvers<undefined>[] = [];

  async write(): Promise<BriefingWritten> {
    this.calls += 1;
    if (this.held) {
      const hold = Promise.withResolvers<undefined>();
      this.holds.push(hold);
      await hold.promise;
    }
    const outcome = this.outcomes.shift() ?? written;
    if (outcome instanceof Error) {
      throw outcome;
    }
    return outcome;
  }

  worstCaseCostMicroUsd(): number {
    return worstCaseMicroUsd;
  }

  queue(outcome: BriefingWritten | Error): void {
    this.outcomes.push(outcome);
  }

  release(): void {
    this.held = false;
    for (const hold of this.holds.splice(0)) {
      hold.resolve(undefined);
    }
  }

  reset(): void {
    this.release();
    this.calls = 0;
    this.outcomes.length = 0;
  }
}

class PeopleAt implements PersonTimeZoneReader {
  zones: Record<string, string> = {};

  async people() {
    return Object.entries(this.zones).map(([userId, timeZone]) => ({
      userId,
      timeZone,
    }));
  }
}

/** The briefing workflows over in-memory storage on a DBOS runtime of its own, with a writer the test scripts. */
export class BriefingWorkflowsFixture {
  readonly briefings = new InMemoryBriefingRepository();
  readonly writer = new ScriptedWriter();
  readonly people = new PeopleAt();
  readonly liveEvents = new InProcessLiveEvents();
  readonly workflows = new DbosBriefingWorkflows({
    briefings: this.briefings,
    ownerTimeZone: new FixedOwnerTimeZone({ timeZone: 'America/New_York' }),
    people: this.people,
    snapshot: new RecordedSnapshot(),
    liveEvents: this.liveEvents,
    generation: {
      settings: { monthlyBudgetUsd: 1, prices },
      writer: this.writer,
    },
  });
  events: LiveEvent[] = [];
  private runtime: DbosWorkflowRuntime | undefined;
  private unsubscribe: (() => void) | undefined;

  async launch(props: { databaseUrl: string; database: string }) {
    const url = new URL(props.databaseUrl);
    const server = new pg.Client({ connectionString: url.toString() });
    await server.connect();
    try {
      await server.query(
        `drop database if exists ${props.database} with (force)`,
      );
    } finally {
      await server.end();
    }
    url.pathname = `/${props.database}`;
    this.workflows.registerWorkflows();
    this.runtime = new DbosWorkflowRuntime({
      databaseUrl: url.toString(),
      logLevel: 'error',
    });
    await this.runtime.launch();
    await this.workflows.activate();
  }

  begin(): void {
    this.events = [];
    this.unsubscribe = this.liveEvents.subscribe((event) =>
      this.events.push(event),
    );
    this.people.zones = {};
    this.briefings.briefings.length = 0;
  }

  end(): void {
    this.unsubscribe?.();
    this.writer.reset();
  }

  async stop(): Promise<void> {
    this.writer.release();
    await this.runtime?.shutdown();
  }

  eventTypes(): string[] {
    return this.events.map(({ type }) => type);
  }

  async started() {
    return DBOS.listWorkflows({ workflowName: 'briefingGenerate' });
  }

  async unfinished() {
    return DBOS.listWorkflows({
      workflowName: 'briefingGenerate',
      status: ['ENQUEUED', 'PENDING'],
    });
  }

  /** Workflows that were never registered, to show what they refuse. */
  static unregistered(props: { configured: boolean }): DbosBriefingWorkflows {
    const writer = new ScriptedWriter();
    return new DbosBriefingWorkflows({
      briefings: new InMemoryBriefingRepository(),
      ownerTimeZone: new FixedOwnerTimeZone({ timeZone: 'America/New_York' }),
      people: new PeopleAt(),
      snapshot: new RecordedSnapshot(),
      liveEvents: new InProcessLiveEvents(),
      generation: props.configured
        ? { settings: { monthlyBudgetUsd: 1, prices }, writer }
        : null,
    });
  }

  /** The zone in which the clock reads `hour` right now. */
  static zoneWhereItIsNow(hour: number): string {
    const offset = ((hour - new Date().getUTCHours() + 36) % 24) - 12;
    if (offset === 0) return 'Etc/GMT';
    return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
  }
}
