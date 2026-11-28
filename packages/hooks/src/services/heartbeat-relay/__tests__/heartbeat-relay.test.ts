import { appendFile, readdir, stat, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeIngest } from '#src/__tests__/support/fake-ingest.js';
import { RecordedPayloads } from '#src/__tests__/support/recorded-payloads.js';
import { ScratchState } from '#src/__tests__/support/scratch-state.js';
import { RelayConfig } from '#src/config/relay-config.js';
import { OutboxHeartbeatRelay } from '#src/services/heartbeat-relay/heartbeat-relay.js';
import { RelayHalt } from '#src/services/relay-halt/relay-halt.js';

let state: ScratchState;
let ingest: FakeIngest;

beforeEach(async () => {
  state = new ScratchState();
  ingest = await FakeIngest.start();
});

afterEach(async () => {
  await ingest.stop();
  await state.remove();
});

/** A relay against the fake ingest, with timings short enough for tests. */
class TestRelay {
  static create(): OutboxHeartbeatRelay {
    return new OutboxHeartbeatRelay({
      config: state.config,
      relayConfig: state.relayConfig(ingest.url),
      pollMs: 10,
      minBackoffMs: 10,
      maxBackoffMs: 40,
    });
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
  it('sends a session in order across batches and exits once the outbox is drained', async () => {
    await state.writeTurns(60);

    expect(await TestRelay.create().run()).toBe('drained');

    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(120));
    expect(ingest.requests).toBe(2);
    expect(await TestRelay.exists(state.config.relayPidPath)).toBe(false);
  });

  it('queues heartbeats through an outage and delivers them in order, once each, when Mission Control returns', async () => {
    await state.writeTurns(2);
    await ingest.stop();

    const running = TestRelay.create().run();
    await state.writeTurns(2);
    await sleep(150);
    expect(ingest.stored).toEqual([]);
    await ingest.restart();

    expect(await running).toBe('drained');
    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(8));
    const log = await state.relayLog();
    expect(log.match(/MissionControlUnavailableError/g)).toHaveLength(1);
    expect(log).not.toContain(FakeIngest.API_KEY);
  });

  it('sends only what Mission Control has not acknowledged on the next run', async () => {
    await state.writeTurns(1);
    await TestRelay.create().run();
    await state.writeTurns(1);

    await TestRelay.create().run();

    expect(ingest.sent).toBe(4);
    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(4));
  });
});

describe('OutboxHeartbeatRelay when Mission Control answers badly', () => {
  it('stops on a refused key, says why without the key, and stays stopped until the key changes', async () => {
    await state.writeTurns(1);
    ingest.mode = 'refuse';

    expect(await TestRelay.create().run()).toBe('halted');
    expect(await TestRelay.create().run()).toBe('halted');

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
      RelayHalt.isHalted(state.config.relayHaltPath, rotated.fingerprint),
    ).toBe(false);
  });

  it('logs a heartbeat Mission Control rejects and moves past it', async () => {
    ingest.invalidSeqs.add(1);
    await state.writeTurns(2);

    expect(await TestRelay.create().run()).toBe('drained');
    await TestRelay.create().run();

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

    await TestRelay.create().run();

    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(4));
    expect(await state.relayLog()).toContain('UnreadableOutboxLineError');
  });
});

describe('OutboxHeartbeatRelay housekeeping', () => {
  it('deletes an ended session once it is delivered, and relays the session again if it resumes', async () => {
    const paths = { cwd: state.directory, transcriptPath: 'unused' };
    await state.writeTurns(1);
    await state.run('session-end', RecordedPayloads.for('session-end', paths));

    await TestRelay.create().run();

    expect(
      await TestRelay.exists(state.outboxPath(RecordedPayloads.SESSION_ID)),
    ).toBe(false);
    expect(await readdir(state.config.relayCursorsDirectory)).toEqual([]);

    await state.writeTurns(1);
    await TestRelay.create().run();
    expect(ingest.seqs()).toEqual(TestRelay.seqsUpTo(5));
    expect(
      await TestRelay.exists(state.outboxPath(RecordedPayloads.SESSION_ID)),
    ).toBe(true);
  });

  it('keeps the outbox of a session that has not ended', async () => {
    await state.writeTurns(1);

    await TestRelay.create().run();

    expect(
      await TestRelay.exists(state.outboxPath(RecordedPayloads.SESSION_ID)),
    ).toBe(true);
  });

  it('leaves the work to a relay that is already running', async () => {
    await state.writeTurns(1);
    await writeFile(state.config.relayPidPath, String(process.ppid));

    expect(await TestRelay.create().run()).toBe('busy');
    expect(ingest.requests).toBe(0);
  });
});
