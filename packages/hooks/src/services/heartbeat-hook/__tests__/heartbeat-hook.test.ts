import { rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type RecordedPayload,
  RecordedPayloads,
} from '#src/__tests__/support/recorded-payloads.js';
import { ScratchState } from '#src/__tests__/support/scratch-state.js';
import type { HookCommand } from '#src/contracts/hook-event.js';

const sessionId = RecordedPayloads.SESSION_ID;

let state: ScratchState;
let transcriptPath: string;

class Payloads {
  static for(command: HookCommand): RecordedPayload {
    return RecordedPayloads.for(command, {
      cwd: state.directory,
      transcriptPath,
    });
  }
}

beforeEach(() => {
  state = new ScratchState();
  transcriptPath = path.join(state.directory, 'transcript.jsonl');
});

afterEach(async () => {
  await state.remove();
});

describe('ClaudeCodeHeartbeatHook across a session', () => {
  it('turns a session that asks, delegates and finishes into valid heartbeats', async () => {
    const commands: HookCommand[] = [
      'session-start',
      'user-prompt-submit',
      'pre-tool-use',
      'post-tool-use',
      'subagent-start',
      'subagent-stop',
      'notification',
      'stop',
      'session-end',
    ];
    for (const command of commands) {
      await state.run(
        command,
        command === 'post-tool-use'
          ? {
              ...Payloads.for(command),
              tool_name: 'AskUserQuestion',
              tool_use_id: 'toolu_01ABC123',
            }
          : Payloads.for(command),
      );
    }

    const heartbeats = await state.heartbeats(sessionId);
    expect(
      heartbeats.map(({ payload }) => [payload.seq, payload.status]),
    ).toEqual([
      [0, 'complete'],
      [1, 'working'],
      [2, 'question'],
      [3, 'working'],
      [4, 'working'],
      [5, 'complete'],
      [6, 'question'],
      [7, 'complete'],
      [8, 'complete'],
    ]);
    expect(
      heartbeats.every(({ payload }) => payload.sessionId === sessionId),
    ).toBe(true);
    expect(await state.log()).toBe('');
  });

  it('carries the session model onto later heartbeats of the main agent only', async () => {
    await state.run('session-start', Payloads.for('session-start'));
    const prompt = await state.run(
      'user-prompt-submit',
      Payloads.for('user-prompt-submit'),
    );
    const subagent = await state.run(
      'subagent-start',
      Payloads.for('subagent-start'),
    );

    expect(prompt?.payload.agent).toEqual({ model: 'claude-opus-5' });
    expect(subagent?.payload.agent).toEqual({ type: 'Explore' });
  });
});

describe('ClaudeCodeHeartbeatHook questions', () => {
  it('copies an AskUserQuestion question and its options verbatim', async () => {
    const heartbeat = await state.run(
      'pre-tool-use',
      Payloads.for('pre-tool-use'),
    );

    expect(heartbeat?.payload.question).toEqual({
      text: 'Which branch should the fix go on?',
      options: [
        { label: 'main', description: 'Ship it in the next release' },
        { label: 'release/1.2' },
      ],
    });
  });

  it('asks with the permission prompt text', async () => {
    const heartbeat = await state.run(
      'notification',
      Payloads.for('notification'),
    );

    expect(heartbeat?.payload.status).toBe('question');
    expect(heartbeat?.payload.question).toEqual({
      text: 'Claude needs your permission to use Bash',
    });
  });

  it('writes nothing for the idle prompt notification', async () => {
    const heartbeat = await state.run('notification', {
      ...Payloads.for('notification'),
      message: 'Claude is waiting for your input',
      notification_type: 'idle_prompt',
    });

    expect(heartbeat).toBeUndefined();
    expect(await state.heartbeats(sessionId)).toEqual([]);
  });

  it('writes nothing before a tool other than AskUserQuestion', async () => {
    const heartbeat = await state.run('pre-tool-use', {
      ...Payloads.for('pre-tool-use'),
      tool_name: 'Bash',
    });

    expect(heartbeat).toBeUndefined();
  });

  it('goes back to working when the question is answered, not when a parallel tool finishes', async () => {
    await state.run('pre-tool-use', Payloads.for('pre-tool-use'));
    const parallel = await state.run(
      'post-tool-use',
      Payloads.for('post-tool-use'),
    );
    const answered = await state.run('post-tool-use', {
      ...Payloads.for('post-tool-use'),
      tool_name: 'AskUserQuestion',
      tool_use_id: 'toolu_01ABC123',
    });

    expect(parallel).toBeUndefined();
    expect(answered?.payload.status).toBe('working');
  });
});

describe('ClaudeCodeHeartbeatHook turn ends', () => {
  it('summarises a finished turn with the last assistant message', async () => {
    const heartbeat = await state.run('stop', Payloads.for('stop'));

    expect(heartbeat?.payload).toMatchObject({
      status: 'complete',
      summary: "I've fixed the flaky test and pushed the branch.",
    });
  });

  it('reads the summary from the transcript when the hook input has none', async () => {
    const entries = [
      { type: 'user', message: { content: [{ type: 'text', text: 'Hi' }] } },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'All tests pass.' }] },
      },
      { type: 'system', subtype: 'stop_hook_summary' },
    ];
    await writeFile(
      transcriptPath,
      entries.map((entry) => JSON.stringify(entry)).join('\n'),
    );

    const heartbeat = await state.run('stop', {
      ...Payloads.for('stop'),
      last_assistant_message: undefined,
    });

    expect(heartbeat?.payload.summary).toBe('All tests pass.');
  });

  it('still writes a heartbeat when the transcript cannot be read', async () => {
    const heartbeat = await state.run('stop', {
      ...Payloads.for('stop'),
      last_assistant_message: undefined,
      transcript_path: path.join(state.directory, 'missing.jsonl'),
    });

    expect(heartbeat?.payload.status).toBe('complete');
    expect(heartbeat?.payload.summary).toBeUndefined();
    expect(await state.heartbeats(sessionId)).toHaveLength(1);
  });

  it('reports an API failure as an error', async () => {
    const heartbeat = await state.run(
      'stop-failure',
      Payloads.for('stop-failure'),
    );

    expect(heartbeat?.payload).toMatchObject({
      status: 'error',
      error: { kind: 'rate_limit', message: '429 Too Many Requests' },
    });
  });
});

describe('ClaudeCodeHeartbeatHook subagents', () => {
  it("reports a subagent under its parent's session", async () => {
    const started = await state.run(
      'subagent-start',
      Payloads.for('subagent-start'),
    );
    const stopped = await state.run(
      'subagent-stop',
      Payloads.for('subagent-stop'),
    );

    expect(started?.payload).toMatchObject({
      sessionId,
      agentId: 'agent-def456',
      agent: { type: 'Explore' },
      status: 'working',
    });
    expect(stopped?.payload).toMatchObject({
      sessionId,
      agentId: 'agent-def456',
      status: 'complete',
      summary: 'Analysis complete. Found 3 potential issues.',
    });
  });

  it('ignores a subagent stop whose start it never saw', async () => {
    const heartbeat = await state.run('subagent-stop', {
      ...Payloads.for('subagent-stop'),
      agent_id: 'internal-suggestion',
      agent_type: '',
    });

    expect(heartbeat).toBeUndefined();
  });
});

describe('ClaudeCodeHeartbeatHook failures and upkeep', () => {
  it('logs a failure instead of throwing', async () => {
    const heartbeat = await state.hook().handle({
      command: 'stop',
      stdin: '{"not": "a hook payload"',
      now: new Date(),
    });

    expect(heartbeat).toBeUndefined();
    expect(await state.log()).toContain('stop');
  });

  it('logs an unknown subcommand', async () => {
    await state.run('pre-compact', Payloads.for('stop'));

    expect(await state.log()).toContain('UnknownHookEventError');
  });

  it('prunes outbox files past retention when a session starts', async () => {
    await state.run('stop', {
      ...Payloads.for('stop'),
      session_id: 'old-session',
    });
    const longAgo = new Date('2026-01-01T00:00:00Z');
    await utimes(state.outboxPath('old-session'), longAgo, longAgo);

    await state.run('session-start', Payloads.for('session-start'));

    expect(await state.heartbeats('old-session')).toEqual([]);
    expect(await state.heartbeats(sessionId)).toHaveLength(1);
  });

  it('keeps counting after the counter file is lost', async () => {
    await state.run('user-prompt-submit', Payloads.for('user-prompt-submit'));
    await state.run('stop', Payloads.for('stop'));
    await rm(state.config.sessionsDirectory, { recursive: true });

    const heartbeat = await state.run(
      'user-prompt-submit',
      Payloads.for('user-prompt-submit'),
    );

    expect(heartbeat?.payload.seq).toBe(2);
  });
});
