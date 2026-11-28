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

const launcher = 'agent-launcher';
const child = 'agent-child';

class Agents {
  static payload(command: HookCommand, agentId: string): RecordedPayload {
    return { ...Payloads.for(command), agent_id: agentId };
  }

  static async start(agentId: string): Promise<void> {
    await state.run(
      'subagent-start',
      Agents.payload('subagent-start', agentId),
    );
  }

  static stop(agentId: string) {
    return state.run('subagent-stop', Agents.payload('subagent-stop', agentId));
  }

  static launch(launcherId: string | undefined, childId: string) {
    const paths = { cwd: state.directory, transcriptPath };
    const payload = RecordedPayloads.backgroundLaunch(paths, childId);
    return state.run('post-tool-use', {
      ...payload,
      agent_id: launcherId,
    });
  }

  static async lastStatus(agentId: string | undefined) {
    const heartbeats = await state.heartbeats(sessionId);
    return heartbeats
      .filter(({ payload }) => payload.agentId === agentId)
      .at(-1)?.payload.status;
  }
}

beforeEach(() => {
  state = new ScratchState();
  transcriptPath = path.join(state.directory, 'transcript.jsonl');
});

afterEach(async () => {
  await state.remove();
});

describe('ClaudeCodeHeartbeatHook subagents with background children', () => {
  it('reports waiting, not complete, when a subagent stops while its background child works', async () => {
    await Agents.start(launcher);
    await Agents.start(child);
    await Agents.launch(launcher, child);

    const stopped = await Agents.stop(launcher);

    expect(stopped?.payload).toMatchObject({
      agentId: launcher,
      status: 'waiting',
      summary: 'Analysis complete. Found 3 potential issues.',
    });
  });

  it('reports complete when the subagent stops again after its child has finished', async () => {
    await Agents.start(launcher);
    await Agents.start(child);
    await Agents.launch(launcher, child);
    await Agents.stop(launcher);
    await Agents.stop(child);

    const stopped = await Agents.stop(launcher);

    expect(stopped?.payload.status).toBe('complete');
  });

  it('reports complete for a subagent that launched nothing', async () => {
    await Agents.start(launcher);

    expect((await Agents.stop(launcher))?.payload.status).toBe('complete');
  });

  it('keeps a launcher waiting while its child waits on a grandchild', async () => {
    await Agents.start(launcher);
    await Agents.start(child);
    await Agents.launch(launcher, child);
    await Agents.launch(child, 'agent-grandchild');
    await Agents.stop(child);

    expect((await Agents.stop(launcher))?.payload.status).toBe('waiting');
    expect(await Agents.lastStatus(child)).toBe('waiting');
  });

  it('counts a child whose start has not been seen as running', async () => {
    await Agents.start(launcher);
    await Agents.launch(launcher, child);

    expect((await Agents.stop(launcher))?.payload.status).toBe('waiting');
  });
});

describe('ClaudeCodeHeartbeatHook launches that arrive late', () => {
  it('moves a launcher that already reported complete to waiting when the launch arrives late', async () => {
    await Agents.start(launcher);
    await Agents.stop(launcher);

    const late = await Agents.launch(launcher, child);

    expect(late?.payload).toMatchObject({
      agentId: launcher,
      status: 'waiting',
    });
  });

  it('leaves a finished launcher alone when the late launch names a child that already finished', async () => {
    await Agents.start(launcher);
    await Agents.start(child);
    await Agents.stop(child);
    await Agents.stop(launcher);

    expect(await Agents.launch(launcher, child)).toBeUndefined();
    expect(await Agents.lastStatus(launcher)).toBe('complete');
  });

  it('does not reopen a launcher after the session has ended', async () => {
    await Agents.start(launcher);
    await Agents.stop(launcher);
    await state.run('session-end', Payloads.for('session-end'));

    expect(await Agents.launch(launcher, child)).toBeUndefined();
  });

  it('goes back to working when a waiting launcher resumes, then completes', async () => {
    await Agents.start(launcher);
    await Agents.start(child);
    await Agents.launch(launcher, child);
    await Agents.stop(launcher);
    await Agents.stop(child);

    const resumed = await state.run('post-tool-use', {
      ...Payloads.for('post-tool-use'),
      agent_id: launcher,
    });
    const stopped = await Agents.stop(launcher);

    expect(resumed?.payload.status).toBe('working');
    expect(stopped?.payload.status).toBe('complete');
  });

  it('ignores a foreground launch and tool responses that are not launches', async () => {
    await Agents.start(launcher);
    const paths = { cwd: state.directory, transcriptPath };
    const foreground = RecordedPayloads.backgroundLaunch(paths, child);
    await state.run('post-tool-use', {
      ...foreground,
      agent_id: launcher,
      tool_response: { status: 'completed', agentId: child },
    });
    await state.hook().handle({
      command: 'post-tool-use',
      stdin: JSON.stringify({
        ...foreground,
        agent_id: launcher,
        tool_response: 'plain text',
      }),
      now: new Date(),
    });

    expect((await Agents.stop(launcher))?.payload.status).toBe('complete');
  });
});

describe('ClaudeCodeHeartbeatHook main agent waiting', () => {
  it('reports the main agent as waiting while a background child works, then complete', async () => {
    await Agents.start(child);
    await Agents.launch(undefined, child);

    const waiting = await state.run('stop', Payloads.for('stop'));
    await Agents.stop(child);
    const done = await state.run('stop', Payloads.for('stop'));

    expect(waiting?.payload.status).toBe('waiting');
    expect(done?.payload.status).toBe('complete');
  });

  it('reports the main agent as waiting while background tasks are in flight', async () => {
    const waiting = await state.run('stop', {
      ...Payloads.for('stop'),
      background_tasks: [
        { id: 'b1', type: 'shell', status: 'running', description: 'tests' },
      ],
      session_crons: [{ id: 'c1' }],
    });
    const complete = await state.run('stop', {
      ...Payloads.for('stop'),
      session_crons: [{ id: 'c1' }],
    });

    expect(waiting?.payload.status).toBe('waiting');
    expect(complete?.payload.status).toBe('complete');
  });

  it('ignores the session-wide task list on a subagent stop', async () => {
    await Agents.start(launcher);

    const stopped = await state.run('subagent-stop', {
      ...Agents.payload('subagent-stop', launcher),
      background_tasks: [{ id: 'b1', type: 'shell', status: 'running' }],
    });

    expect(stopped?.payload.status).toBe('complete');
  });
});
