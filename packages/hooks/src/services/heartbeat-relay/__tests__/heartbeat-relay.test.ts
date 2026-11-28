import { appendFile, readdir, stat, utimes, writeFile } from 'node:fs/promises';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

import { FakeIngest } from '#src/__tests__/support/fake-ingest.js';
import { FakeTimers } from '#src/__tests__/support/fake-timers.js';
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

  static spyOnBackoff(): MockInstance<(failures: number) => number> {
    // SAFETY: `backoffMs` is a private method of the relay with exactly this signature.
    // eslint-disable-next-line preflight/no-chained-type-assertions -- reaching a private method needs the cast through unknown
    const relay = OutboxHeartbeatRelay.prototype as unknown as {
      backoffMs: (failures: number) => number;
    };
    return vi.spyOn(relay, 'backoffMs');
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

describe('FakeTimers.fire', () => {
  it('surfaces the relay rejection as the cause when it fails before the timers fire', async () => {
    const failure = new Error('disk unplugged');
    const rejected = Promise.reject<RelayOutcome>(failure);

    await expect(FakeTimers.fire(rejected, 3)).rejects.toMatchObject({
      cause: failure,
      message: expect.stringContaining('disk unplugged'),
    });
  });

  it('reports an early resolve as the relay settling before the timers fired', async () => {
    await expect(
      FakeTimers.fire(Promise.resolve<RelayOutcome>('drained'), 3),
    ).rejects.toThrow('Relay settled after 0 of 3 timers fired');
  });
});

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
    const backoffSpy = TestRelay.spyOnBackoff();

    const running = TestRelay.start();
    await FakeTimers.fire(running, 3);
    const backoffs = backoffSpy.mock.results.map((result) => result.value);
    await state.writeTurns(2);
    expect(ingest.stored).toEqual([]);
    await ingest.restart();

    expect(await FakeTimers.runUntil(running)).toBe('drained');
    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(8));
    expect(backoffs).toEqual([10, 20, 40, 40]);

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
