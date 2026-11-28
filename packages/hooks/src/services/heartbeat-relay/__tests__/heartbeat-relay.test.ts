import { appendFile, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import { setImmediate as nextTurn } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeIngest } from '#src/__tests__/support/fake-ingest.js';
import { RecordedPayloads } from '#src/__tests__/support/recorded-payloads.js';
import { ScratchState } from '#src/__tests__/support/scratch-state.js';
import { RelayConfig } from '#src/config/relay-config.js';
import {
  OutboxHeartbeatRelay,
  type RelayOutcome,
} from '#src/services/heartbeat-relay/heartbeat-relay.js';
import { RelayCursorStore } from '#src/services/relay-cursor-store/relay-cursor-store.js';
import { RelayHaltRecord } from '#src/services/relay-halt-record/relay-halt-record.js';
import { RelayLock } from '#src/services/relay-lock/relay-lock.js';
import { FileSessionLedger } from '#src/services/session-ledger/session-ledger.js';

let state: ScratchState;
let ingest: FakeIngest;
let runs: Promise<RelayOutcome>[];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  state = new ScratchState();
  ingest = await FakeIngest.start();
  runs = [];
});

afterEach(async () => {
  try {
    await FakeTimers.runUntil(Promise.allSettled(runs));
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await ingest.stop();
    await state.remove();
  }
});

/**
 * Moves fake time forward one timer at a time, with a real turn of the event loop before each step
 * so the relay's file and network I/O finishes before its next poll or backoff fires. Both drivers
 * give up after `MAX_STEPS` turns and reject, so a hung or early-settling relay fails with a
 * message instead of waiting out the test timeout.
 */
class FakeTimers {
  private static readonly MAX_STEPS = 10_000;

  static async runUntil<T>(work: Promise<T>): Promise<T> {
    let settled = false;
    const watched = work.finally(() => {
      settled = true;
    });
    watched.catch(() => undefined);

    for (let step = 0; !settled; step += 1) {
      if (step >= FakeTimers.MAX_STEPS) {
        throw new Error(
          `Relay still running after ${FakeTimers.MAX_STEPS} fake-timer steps; it looks hung.`,
        );
      }
      await nextTurn();
      if (vi.getTimerCount() > 0) {
        await vi.advanceTimersToNextTimerAsync();
      }
    }
    return watched;
  }

  /** Fires `count` timers, then returns once the next one is pending, leaving it unfired. */
  static async fire(
    running: Promise<RelayOutcome>,
    count: number,
  ): Promise<void> {
    let settled = false;
    const markSettled = (): void => {
      settled = true;
    };
    running.then(markSettled, markSettled);

    let fired = 0;
    for (let step = 0; step < FakeTimers.MAX_STEPS; step += 1) {
      await nextTurn();
      if (settled) {
        throw new Error(
          `Relay settled after ${fired} of ${count} timers fired, with the next still to come.`,
        );
      }
      if (vi.getTimerCount() === 0) {
        continue;
      }
      if (fired === count) {
        return;
      }
      await vi.advanceTimersToNextTimerAsync();
      fired += 1;
    }
    throw new Error(
      `Gave up after ${FakeTimers.MAX_STEPS} steps with ${fired} of ${count} timers fired.`,
    );
  }
}

/** Relays against the fake ingest, each tracked so teardown waits for it before removing the state. */
class TestRelay {
  static readonly POLL_MS = 7;
  static readonly MIN_BACKOFF_MS = 10;
  static readonly MAX_BACKOFF_MS = 40;

  static start(): Promise<RelayOutcome> {
    const running = new OutboxHeartbeatRelay({
      config: state.config,
      relayConfig: state.relayConfig(ingest.url),
      pollMs: TestRelay.POLL_MS,
      minBackoffMs: TestRelay.MIN_BACKOFF_MS,
      maxBackoffMs: TestRelay.MAX_BACKOFF_MS,
    }).run();
    runs.push(running);
    return running;
  }

  /** A relay sleep that is a backoff: not the poll interval, and no longer than the backoff cap. */
  static isBackoff(ms: number | undefined): boolean {
    return (
      ms !== TestRelay.POLL_MS && (ms ?? Infinity) <= TestRelay.MAX_BACKOFF_MS
    );
  }

  static run(): Promise<RelayOutcome> {
    return FakeTimers.runUntil(TestRelay.start());
  }

  static seqsUpTo(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index);
  }

  static async exists(file: string): Promise<boolean> {
    return stat(file).then(
      () => true,
      () => false,
    );
  }
}

describe('OutboxHeartbeatRelay', () => {
  it(
    'sends a session in order across batches and exits once the outbox is drained',
    {
      timeout: 30_000,
    },
    async () => {
      await state.writeTurns(60);

      expect(await TestRelay.run()).toBe('drained');

      expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(120));
      expect(ingest.requests).toBe(2);
      expect(await TestRelay.exists(state.config.relayPidPath)).toBe(false);
    },
  );

  it('queues heartbeats through an outage and delivers them in order, once each, when Mission Control returns', async () => {
    await state.writeTurns(2);
    await ingest.stop();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const timeouts = vi.spyOn(globalThis, 'setTimeout');

    const running = TestRelay.start();
    await FakeTimers.fire(running, 2);
    const backoffs = timeouts.mock.calls
      .map(([, ms]) => ms)
      .filter((ms) => TestRelay.isBackoff(ms));
    await state.writeTurns(2);
    expect(ingest.stored).toEqual([]);
    await ingest.restart();

    expect(await FakeTimers.runUntil(running)).toBe('drained');
    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(8));
    expect(backoffs).toEqual([10, 20, 40]);

    const log = await state.relayLog();
    expect(log.match(/MissionControlUnavailableError/g)).toHaveLength(1);
    expect(log).not.toContain(FakeIngest.API_KEY);
  });

  it('sends only what Mission Control has not acknowledged on the next run', async () => {
    await state.writeTurns(1);
    await TestRelay.run();
    await state.writeTurns(1);

    await TestRelay.run();

    expect(ingest.sent).toBe(4);
    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(4));
  });

  it('delivers a line written while it was exiting, after letting go of the lock', async () => {
    await state.writeTurns(1);
    const release = RelayLock.prototype.release;
    const releases = vi
      .spyOn(RelayLock.prototype, 'release')
      .mockImplementationOnce(async function (this: RelayLock) {
        await state.writeTurns(1);
        return release.call(this);
      });

    expect(await TestRelay.run()).toBe('drained');

    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(4));
    expect(releases).toHaveBeenCalledTimes(2);
    expect(await TestRelay.exists(state.config.relayPidPath)).toBe(false);
  });
});

describe('OutboxHeartbeatRelay when Mission Control answers badly', () => {
  it('stops on a refused key, says why without the key, and stays stopped until the key changes', async () => {
    await state.writeTurns(1);
    ingest.mode = 'refuse';

    expect(await TestRelay.run()).toBe('halted');
    expect(await TestRelay.run()).toBe('halted');

    expect(ingest.requests).toBe(1);
    const log = await state.relayLog();
    expect(log).toContain('MissionControlRefusedKeyError');
    expect(log).toContain('401');
    expect(log).not.toContain(FakeIngest.API_KEY);
    const rotated = new RelayConfig({
      apiUrl: ingest.url,
      apiKey: 'dash_dev_a-new-key',
      reporterName: FakeIngest.REPORTER,
    });
    expect(
      RelayHaltRecord.isHalted(state.config.relayHaltPath, rotated.fingerprint),
    ).toBe(false);
  });

  it('stops on a 403 as it does on a 401', async () => {
    await state.writeTurns(1);
    ingest.mode = 'refuse';
    ingest.refusalStatus = 403;

    expect(await TestRelay.run()).toBe('halted');
    expect(await TestRelay.run()).toBe('halted');

    expect(ingest.requests).toBe(1);
    expect(ingest.stored).toEqual([]);
    expect(await state.relayLog()).toMatch(
      /MissionControlRefusedKeyError.*403/,
    );
    expect(
      RelayHaltRecord.isHalted(
        state.config.relayHaltPath,
        state.relayConfig(ingest.url).fingerprint,
      ),
    ).toBe(true);
  });

  it('logs a heartbeat Mission Control rejects and moves past it', async () => {
    ingest.invalidSeqs.add(1);
    await state.writeTurns(2);

    expect(await TestRelay.run()).toBe('drained');
    await TestRelay.run();

    expect(ingest.seqs()).toEqual([0, 2, 3]);
    expect(ingest.requests).toBe(1);
    expect(await state.relayLog()).toMatch(/HeartbeatRejectedError.*seq 1 /);
  });

  it('skips a line that is not JSON and sends the rest', async () => {
    await state.writeTurns(1);
    await appendFile(
      state.outboxPath(RecordedPayloads.SESSION_ID),
      'not json\n',
    );
    await state.writeTurns(1);

    await TestRelay.run();

    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(4));
    expect(await state.relayLog()).toContain('UnreadableOutboxLineError');
  });
});

describe('OutboxHeartbeatRelay housekeeping', () => {
  it('deletes an ended session once it is delivered, and relays the session again if it resumes', async () => {
    const paths = { cwd: state.directory, transcriptPath: 'unused' };
    await state.writeTurns(1);
    await state.run('session-end', RecordedPayloads.for('session-end', paths));

    await TestRelay.run();

    expect(
      await TestRelay.exists(state.outboxPath(RecordedPayloads.SESSION_ID)),
    ).toBe(false);
    expect(await readdir(state.config.relayCursorsDirectory)).toEqual([]);

    await state.writeTurns(1);
    await TestRelay.run();
    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(5));
    expect(
      await TestRelay.exists(state.outboxPath(RecordedPayloads.SESSION_ID)),
    ).toBe(true);
  });

  it('deletes the relay cursor along with an expired outbox, and relays the resumed session in full', async () => {
    const paths = { cwd: state.directory, transcriptPath: 'unused' };
    const outboxPath = state.outboxPath(RecordedPayloads.SESSION_ID);
    const cursorPath = RelayCursorStore.cursorPath(
      state.config.relayCursorsDirectory,
      FileSessionLedger.fileStem(RecordedPayloads.SESSION_ID),
    );
    await state.writeTurns(1);
    await TestRelay.run();
    expect(await TestRelay.exists(cursorPath)).toBe(true);
    const longAgo = new Date('2026-01-01T00:00:00Z');
    await utimes(outboxPath, longAgo, longAgo);

    await state.run('session-start', {
      ...RecordedPayloads.for('session-start', paths),
      session_id: 'another-session',
    });

    expect(await TestRelay.exists(outboxPath)).toBe(false);
    expect(await TestRelay.exists(cursorPath)).toBe(false);

    await state.writeTurns(1);
    await TestRelay.run();
    expect(
      ingest.stored.filter(
        ({ sessionId }) => sessionId === RecordedPayloads.SESSION_ID,
      ),
    ).toHaveLength(4);
  });

  it('keeps the outbox of a session that has not ended', async () => {
    await state.writeTurns(1);

    await TestRelay.run();

    expect(
      await TestRelay.exists(state.outboxPath(RecordedPayloads.SESSION_ID)),
    ).toBe(true);
  });

  it('leaves the work to a relay that is already running', async () => {
    await state.writeTurns(1);
    await writeFile(state.config.relayPidPath, String(process.ppid));

    expect(await TestRelay.run()).toBe('busy');
    expect(ingest.requests).toBe(0);
  });
});
