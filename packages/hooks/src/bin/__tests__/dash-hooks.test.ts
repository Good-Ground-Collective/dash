import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

  static run(props: {
    stateDirectory: string;
    command: string;
    stdin: string;
  }): Promise<HookRun> {
    return new Promise((resolve) => {
      const child = execFile(
        process.execPath,
        [
          '--conditions=@good-ground-collective/dash-hooks-source',
          HookProcess.ENTRY,
          props.command,
        ],
        { env: { DASH_STATE_DIR: props.stateDirectory } },
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
