import { DBOS } from '@dbos-inc/dbos-sdk';
import pg from 'pg';
import { z } from 'zod';

import { AgentRecordsDatabase } from '#src/agents/__tests__/support/agent-records-database.ts';
import { PublishingAgentSessionWatchdog } from '#src/agents/services/agent-session-watchdog/agent-session-watchdog.ts';
import {
  AgentSessionWatchdogWorkflows,
  agentSessionWatchdogScheduleName,
  retiredExampleScheduleName,
} from '#src/agents/services/agent-session-watchdog-workflows/agent-session-watchdog-workflows.ts';
import { RulesNeedsYouTriage } from '#src/agents/services/needs-you-triage/needs-you-triage.ts';
import type { LiveEvent } from '#src/live/contracts/live-event.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';
import { DbosWorkflowRuntime } from '#src/platform/services/workflows/workflow-runtime.ts';

const dbosWatchdogFixturePropsSchema = z.object({
  databaseUrl: z.url(),
  name: z.string().min(1),
});

const hourMilliseconds = 60 * 60 * 1000;

/**
 * The watchdog on the real DBOS runtime over a disposable migrated database. Ticks of its
 * schedule are backfilled at times the test chooses, so the schedule's own clock never moves rows.
 */
export class DbosWatchdogFixture {
  readonly published: LiveEvent[] = [];
  private readonly props: z.output<typeof dbosWatchdogFixturePropsSchema>;
  private readonly liveEvents = new InProcessLiveEvents();
  private store: AgentRecordsDatabase | undefined;
  private runtime: DbosWorkflowRuntime | undefined;
  private workflows: AgentSessionWatchdogWorkflows | undefined;
  private startedAt = new Date('2026-11-27T10:00:00Z');

  constructor(props: z.input<typeof dbosWatchdogFixturePropsSchema>) {
    this.props = dbosWatchdogFixturePropsSchema.parse(props);
    this.liveEvents.subscribe((event) => this.published.push(event));
  }

  get records(): AgentRecordsDatabase {
    return AgentRecordsDatabase.required(this.store);
  }

  async launch(): Promise<void> {
    const server = new pg.Client({ connectionString: this.props.databaseUrl });
    await server.connect();
    try {
      await server.query(
        `drop database if exists "${this.props.name}" with (force)`,
      );
    } finally {
      await server.end();
    }

    this.store = await AgentRecordsDatabase.open({
      serverUrl: this.props.databaseUrl,
      name: this.props.name,
    });
    this.workflows = new AgentSessionWatchdogWorkflows({
      watchdog: new PublishingAgentSessionWatchdog({
        repository: this.store.sessions,
        liveEvents: this.liveEvents,
        triage: new RulesNeedsYouTriage({
          repository: this.store.needsYou,
          liveEvents: this.liveEvents,
        }),
      }),
    });
    this.workflows.registerWorkflows();
    const retiredExample = DBOS.registerWorkflow(async () => {}, {
      name: 'exampleScheduledHeartbeat',
    });

    const url = new URL(this.props.databaseUrl);
    url.pathname = `/${this.props.name}`;
    this.runtime = new DbosWorkflowRuntime({
      databaseUrl: url.toString(),
      logLevel: 'error',
    });
    await this.runtime.launch();
    await DBOS.applySchedules([
      {
        scheduleName: retiredExampleScheduleName,
        workflowFn: retiredExample,
        schedule: '*/30 * * * * *',
      },
    ]);
    await this.activate();
    await DBOS.pauseSchedule(agentSessionWatchdogScheduleName);
  }

  /** Activates the watchdog's schedules, as the agents module does at startup. */
  async activate(): Promise<void> {
    if (this.workflows === undefined) {
      throw new TypeError('Launch the watchdog fixture before activating it');
    }
    await this.workflows.activate();
  }

  /** The names of the schedules DBOS holds for this application. */
  async scheduleNames(): Promise<string[]> {
    const schedules = await DBOS.listSchedules();
    return schedules.map(({ scheduleName }) => scheduleName);
  }

  async stop(): Promise<void> {
    await this.runtime?.shutdown();
    await this.store?.close();
  }

  /** Starts a test with no rows, on an hour of the fixed clock no other test uses. */
  async begin(): Promise<Date> {
    this.startedAt = new Date(this.startedAt.getTime() + hourMilliseconds);
    this.published.length = 0;
    await this.records.reset();
    return this.startedAt;
  }

  /** A heartbeat from the bench, recorded as received at the start of the test's hour. */
  async hear(
    payload: NonNullable<Parameters<typeof AgentRecordsDatabase.record>[0]> & {
      sessionId: string;
    },
  ): Promise<void> {
    await this.records.heartbeats.record(AgentRecordsDatabase.record(payload));
    await this.records.heardAt({
      sessionId: payload.sessionId,
      at: this.startedAt,
    });
  }

  /** Each session's liveness, by session id. */
  async liveness(): Promise<Record<string, string>> {
    const states = await this.records.sessions.listUpdatedSince({
      since: new Date(0),
    });
    return Object.fromEntries(
      states.map(({ sessionId, liveness }) => [sessionId, liveness]),
    );
  }

  /** Runs the schedule's tick that falls `minutes` after `startedAt` through DBOS, and waits for it to finish. */
  async tick(minutes: number): Promise<void> {
    const at = this.startedAt.getTime() + minutes * 60_000;
    const handles = await DBOS.backfillSchedule(
      agentSessionWatchdogScheduleName,
      new Date(at - 1000),
      new Date(at + 1000),
    );
    await Promise.all(handles.map((handle) => handle.getResult()));
  }
}
