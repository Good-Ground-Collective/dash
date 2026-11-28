import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { stat, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeIngest } from '#src/__tests__/support/fake-ingest.js';
import { RecordedPayloads } from '#src/__tests__/support/recorded-payloads.js';
import { ScratchState } from '#src/__tests__/support/scratch-state.js';

interface HookRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the real `dash-hooks` entry point from source, as Claude Code would, in its own process. */
class HookProcess {
  static readonly ENTRY = fileURLToPath(
    new URL('../dash-hooks.ts', import.meta.url),
  );

  static readonly ARGS = [
    '--conditions=@good-ground-collective/dash-hooks-source',
    HookProcess.ENTRY,
  ];

  /** Only the scratch directory, so no test reads the real `~/.config/dash/hooks.json` or sends to a real Mission Control. */
  static env(stateDirectory: string, extra: Record<string, string> = {}) {
    return {
      DASH_STATE_DIR: stateDirectory,
      HOME: stateDirectory,
      XDG_CONFIG_HOME: stateDirectory,
      ...extra,
    };
  }

  /** The relay environment for the fake ingest, with a short idle period. */
  static relayEnv(url: string) {
    return {
      DASH_API_URL: url,
      DASH_API_KEY: FakeIngest.API_KEY,
      DASH_REPORTER_NAME: FakeIngest.REPORTER,
      DASH_RELAY_IDLE_MS: '100',
    };
  }

  static run(props: {
    stateDirectory: string;
    command: string;
    stdin: string;
    env?: Record<string, string>;
  }): Promise<HookRun> {
    return new Promise((resolve) => {
      const child = execFile(
        process.execPath,
        [...HookProcess.ARGS, props.command],
        { env: HookProcess.env(props.stateDirectory, props.env) },
        (_error, stdout, stderr) => {
          resolve({ code: child.exitCode, stdout, stderr });
        },
      );
      child.stdin?.end(props.stdin);
    });
  }
}

let state: ScratchState;

beforeEach(() => {
  state = new ScratchState();
});

afterEach(async () => {
  await state.remove();
});

describe('dash-hooks', () => {
  it('gives hooks that fire at once in one session distinct, increasing seq values', async () => {
    const payload = RecordedPayloads.for('subagent-start', {
      cwd: state.directory,
      transcriptPath: 'unused',
    });
    const runs = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        HookProcess.run({
          stateDirectory: state.directory,
          command: 'subagent-start',
          stdin: JSON.stringify({ ...payload, agent_id: `agent-${index}` }),
        }),
      ),
    );

    expect(runs.every((run) => run.code === 0 && run.stdout === '')).toBe(true);
    const seqs = (await state.heartbeats(RecordedPayloads.SESSION_ID)).map(
      ({ payload: heartbeat }) => heartbeat.seq,
    );
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, index) => index));
  }, 30_000);

  it('exits 0 and logs when writing the outbox fails', async () => {
    await writeFile(
      state.config.outboxDirectory,
      'a file where the outbox folder should be',
    );

    const run = await HookProcess.run({
      stateDirectory: state.directory,
      command: 'stop',
      stdin: JSON.stringify(
        RecordedPayloads.for('stop', {
          cwd: state.directory,
          transcriptPath: 'unused',
        }),
      ),
    });

    expect(run).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await state.log()).toMatch(/ stop pid=\d+ Error: EEXIST/);
  });

  it('exits 0 and logs when the hook input is not JSON', async () => {
    const run = await HookProcess.run({
      stateDirectory: state.directory,
      command: 'user-prompt-submit',
      stdin: 'not json',
    });

    expect(run.code).toBe(0);
    expect(await state.log()).toContain('user-prompt-submit');
  });
});

describe('dash-hooks relay', () => {
  it('starts from a hook, delivers the heartbeat and exits once the outbox is drained', async () => {
    const ingest = await FakeIngest.start();
    try {
      await HookProcess.run({
        stateDirectory: state.directory,
        command: 'stop',
        stdin: JSON.stringify(
          RecordedPayloads.for('stop', {
            cwd: state.directory,
            transcriptPath: 'unused',
          }),
        ),
        env: HookProcess.relayEnv(ingest.url),
      });

      let relayRunning = true;
      for (let waited = 0; waited < 10_000 && relayRunning; waited += 50) {
        await sleep(50);
        relayRunning = await stat(state.config.relayPidPath).then(
          () => true,
          () => ingest.stored.length === 0,
        );
      }

      expect(relayRunning).toBe(false);
      expect(ingest.seqs()).toEqual([0]);
      expect(await state.relayLog()).toBe('');
    } finally {
      await ingest.stop();
    }
  }, 15_000);

  it('loses nothing and stores nothing twice when the relay is killed mid-send', async () => {
    const ingest = await FakeIngest.start();
    try {
      await state.writeTurns(3);
      ingest.mode = 'store-then-hang';
      const env = HookProcess.env(
        state.directory,
        HookProcess.relayEnv(ingest.url),
      );

      const killed = spawn(process.execPath, [...HookProcess.ARGS, 'relay'], {
        env,
      });
      await ingest.untilHung();
      killed.kill('SIGKILL');
      await once(killed, 'exit');

      ingest.mode = 'up';
      const resumed = spawn(process.execPath, [...HookProcess.ARGS, 'relay'], {
        env,
      });
      const [code] = await once(resumed, 'exit');

      expect(code).toBe(0);
      expect(ingest.sent).toBe(12);
      expect(ingest.seqs()).toEqual([0, 1, 2, 3, 4, 5]);
    } finally {
      await ingest.stop();
    }
  }, 15_000);
});
