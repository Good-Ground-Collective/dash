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

  /** A main-agent Stop from a Claude Code that sent no `background_tasks` list. */
  static stopWithoutTaskList(): RecordedPayload {
    const { background_tasks: _omitted, ...rest } = Payloads.for('stop');
    return rest;
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

describe('ClaudeCodeHeartbeatHook launches while waiting', () => {
  it('keeps a waiting subagent launcher waiting when a second launch arrives late', async () => {
    const second = 'agent-child-b';
    await Agents.start(launcher);
    await Agents.start(child);
    await Agents.start(second);
    await Agents.launch(launcher, child);
    const stopped = await Agents.stop(launcher);
    await Agents.launch(launcher, second);

    expect(stopped?.payload.status).toBe('waiting');
    expect(await Agents.lastStatus(launcher)).toBe('waiting');
  });

  it('keeps a waiting main agent waiting when a second launch arrives late', async () => {
    await Agents.launch(undefined, child);
    const waiting = await state.run('stop', Payloads.stopWithoutTaskList());
    await Agents.launch(undefined, 'agent-child-b');

    expect(waiting?.payload.status).toBe('waiting');
    expect(await Agents.lastStatus(undefined)).toBe('waiting');
  });
});

describe('ClaudeCodeHeartbeatHook stops of launched children', () => {
  it('records the stop of a launched child whose start was never seen', async () => {
    await Agents.start(launcher);
    await Agents.launch(launcher, child);
    const waiting = await Agents.stop(launcher);
    const childStop = await Agents.stop(child);
    const done = await Agents.stop(launcher);

    expect(waiting?.payload.status).toBe('waiting');
    expect(childStop?.payload).toMatchObject({
      agentId: child,
      status: 'complete',
    });
    expect(done?.payload.status).toBe('complete');
  });

  it('writes nothing for a stop of an unrecorded, unstarted agent', async () => {
    expect(await Agents.stop('agent-unseen')).toBeUndefined();
  });
});

describe('ClaudeCodeHeartbeatHook main agent waiting', () => {
  it('reports the main agent as waiting while a background child works, then complete', async () => {
    await Agents.start(child);
    await Agents.launch(undefined, child);

    const waiting = await state.run('stop', Payloads.stopWithoutTaskList());
    await Agents.stop(child);
    const done = await state.run('stop', Payloads.stopWithoutTaskList());

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

describe('ClaudeCodeHeartbeatHook main agent background_tasks', () => {
  it('reports complete on an empty background_tasks list even if a recorded child never finished', async () => {
    await Agents.start(child);
    await Agents.launch(undefined, child);

    const stopped = await state.run('stop', {
      ...Payloads.for('stop'),
      background_tasks: [],
    });
    const again = await state.run('stop', {
      ...Payloads.for('stop'),
    });

    expect(stopped?.payload.status).toBe('complete');
    expect(again?.payload.status).toBe('complete');
  });

  it('reports waiting on a non-empty background_tasks list even when no child is recorded', async () => {
    const stopped = await state.run('stop', {
      ...Payloads.for('stop'),
      background_tasks: [{ id: 'm1', type: 'monitor', status: 'running' }],
    });

    expect(stopped?.payload.status).toBe('waiting');
  });

  it('falls back to the recorded children when background_tasks is absent', async () => {
    await Agents.launch(undefined, child);

    const stopped = await state.run('stop', Payloads.stopWithoutTaskList());

    expect(stopped?.payload.status).toBe('waiting');
  });
});
