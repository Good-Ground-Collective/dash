import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentHeartbeatFixtures } from '#src/agents/__tests__/support/agent-heartbeat-fixtures.ts';
import { InMemoryAgentRecords } from '#src/agents/__tests__/support/in-memory-agent-records.ts';
import { PublishingAgentSessionWatchdog } from '#src/agents/services/agent-session-watchdog/agent-session-watchdog.ts';
import type { LiveEvent } from '#src/live/contracts/live-event.ts';
import { InProcessLiveEvents } from '#src/live/services/live-events/live-events.ts';

const heardAt = new Date('2026-11-27T10:00:00Z');
const reportedBy = '00000000-0000-4000-8000-0000000000b1';

/** A watchdog over in-memory records on a fixed clock that starts at `heardAt`. */
class WatchdogScenario {
  readonly records = new InMemoryAgentRecords();
  readonly published: LiveEvent[] = [];
  readonly watchdog: PublishingAgentSessionWatchdog;

  constructor() {
    const liveEvents = new InProcessLiveEvents();
    liveEvents.subscribe((event) => this.published.push(event));
    this.watchdog = new PublishingAgentSessionWatchdog({
      repository: this.records,
      liveEvents,
    });
  }

  async hear(
    payload: Parameters<typeof AgentHeartbeatFixtures.message>[0],
  ): Promise<void> {
    await this.records.record({
      reporterName: 'seth-laptop',
      benchId: 'studio-mac',
      reportedBy,
      message: AgentHeartbeatFixtures.message(payload),
    });
  }

  async sweepAfter(minutes: number): Promise<number> {
    return this.watchdog.sweep({
      now: new Date(heardAt.getTime() + minutes * 60_000),
    });
  }

  async liveness(): Promise<string[]> {
    const states = await this.records.listUpdatedSince({ since: new Date(0) });
    return states.map((state) => state.liveness);
  }
}

let scenario: WatchdogScenario;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(heardAt);
  scenario = new WatchdogScenario();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PublishingAgentSessionWatchdog', () => {
  it('leaves a working session alone after 9 minutes of silence', async () => {
    await scenario.hear({ seq: 1 });

    const changed = await scenario.sweepAfter(9);

    expect(changed).toBe(0);
    expect(await scenario.liveness()).toEqual(['live']);
    expect(scenario.published).toEqual([]);
  });

  it('marks a working session stale at 10 minutes and lost at 30, publishing each change once', async () => {
    await scenario.hear({ seq: 1 });

    await scenario.sweepAfter(10);
    await scenario.sweepAfter(11);
    expect(await scenario.liveness()).toEqual(['stale']);

    await scenario.sweepAfter(29);
    expect(await scenario.liveness()).toEqual(['stale']);
    await scenario.sweepAfter(30);
    await scenario.sweepAfter(31);

    expect(await scenario.liveness()).toEqual(['lost']);
    expect(scenario.published).toMatchObject([
      { type: 'agent.session.updated', data: { liveness: 'stale' } },
      { type: 'agent.session.updated', data: { liveness: 'lost' } },
    ]);
  });

  it('marks a session lost at once when the first sweep comes after 30 minutes', async () => {
    await scenario.hear({ seq: 1 });

    await scenario.sweepAfter(45);

    expect(await scenario.liveness()).toEqual(['lost']);
  });

  it('marks a silent subagent as well as its session', async () => {
    await scenario.hear({ seq: 1 });
    await scenario.hear({ seq: 2, agentId: 'plan-1' });

    const changed = await scenario.sweepAfter(10);

    expect(changed).toBe(2);
    expect(await scenario.liveness()).toEqual(['stale', 'stale']);
  });

  it('clears stale and lost with the next heartbeat', async () => {
    await scenario.hear({ seq: 1 });
    await scenario.sweepAfter(35);
    expect(await scenario.liveness()).toEqual(['lost']);

    vi.setSystemTime(new Date(heardAt.getTime() + 36 * 60_000));
    await scenario.hear({ seq: 2 });

    expect(await scenario.liveness()).toEqual(['live']);
    await scenario.sweepAfter(36);
    expect(await scenario.liveness()).toEqual(['live']);
  });

  it.each(['question', 'waiting', 'blocked', 'complete'] as const)(
    'never marks a session whose status is %s',
    async (status) => {
      await scenario.hear({ seq: 1, status });

      const changed = await scenario.sweepAfter(120);

      expect(changed).toBe(0);
      expect(await scenario.liveness()).toEqual(['live']);
      expect(scenario.published).toEqual([]);
    },
  );
});
