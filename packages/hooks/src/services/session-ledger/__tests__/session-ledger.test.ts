import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ScratchState } from '#src/__tests__/support/scratch-state.js';
import type {
  HeartbeatCondition,
  HeartbeatPlan,
} from '#src/services/heartbeat-mapper/heartbeat-plan.js';
import { FileSessionLedger } from '#src/services/session-ledger/session-ledger.js';

const start = new Date('2026-11-27T09:30:00Z').getTime();

let state: ScratchState;

beforeEach(() => {
  state = new ScratchState();
});

afterEach(async () => {
  await state.remove();
});

class Plans {
  static make(
    status: HeartbeatPlan['draft']['status'],
    condition: HeartbeatCondition = 'always',
    agentId?: string,
  ): HeartbeatPlan {
    return {
      draft: {
        sessionId: 'session-1',
        harness: 'claude-code',
        status,
        agentId,
      },
      condition,
    };
  }

  static asked(toolUseId: string): HeartbeatPlan {
    return { ...Plans.make('question'), awaitsAnswer: true, toolUseId };
  }

  static answered(toolUseId: string): HeartbeatPlan {
    return { ...Plans.make('working', 'answer'), toolUseId };
  }

  static async record(
    ledger: FileSessionLedger,
    plan: HeartbeatPlan,
    secondsIn: number,
  ): Promise<number | undefined> {
    const heartbeat = await ledger.record(
      plan,
      new Date(start + secondsIn * 1000),
    );
    return heartbeat?.payload.seq;
  }
}

describe('FileSessionLedger liveness', () => {
  it('sends at most one liveness heartbeat a minute while the agent is working', async () => {
    const ledger = new FileSessionLedger({ config: state.config });
    const liveness = Plans.make('working', 'liveness');

    expect(await Plans.record(ledger, Plans.make('working'), 0)).toBe(0);
    expect(await Plans.record(ledger, liveness, 10)).toBeUndefined();
    expect(await Plans.record(ledger, liveness, 59)).toBeUndefined();
    expect(await Plans.record(ledger, liveness, 61)).toBe(1);
    expect(await Plans.record(ledger, liveness, 90)).toBeUndefined();
  });

  it('sends a liveness heartbeat straight away after a question is answered', async () => {
    const ledger = new FileSessionLedger({ config: state.config });

    await Plans.record(ledger, Plans.make('question'), 0);

    expect(
      await Plans.record(ledger, Plans.make('working', 'liveness'), 5),
    ).toBe(1);
  });

  it('keeps an AskUserQuestion open until its own answer arrives', async () => {
    const ledger = new FileSessionLedger({ config: state.config });
    const liveness = Plans.make('working', 'liveness');

    await ledger.record(
      { ...Plans.make('question'), awaitsAnswer: true },
      new Date(start),
    );

    expect(await Plans.record(ledger, liveness, 120)).toBeUndefined();
    expect(await Plans.record(ledger, Plans.make('working'), 130)).toBe(1);
    expect(await Plans.record(ledger, liveness, 200)).toBe(2);
  });

  it('sends no liveness heartbeat after the turn has ended', async () => {
    const ledger = new FileSessionLedger({ config: state.config });

    await Plans.record(ledger, Plans.make('complete'), 0);

    expect(
      await Plans.record(ledger, Plans.make('working', 'liveness'), 600),
    ).toBeUndefined();
  });
});

describe('FileSessionLedger late AskUserQuestion answers', () => {
  it('writes the answer to the question that is still open', async () => {
    const ledger = new FileSessionLedger({ config: state.config });

    await Plans.record(ledger, Plans.asked('toolu_q1'), 0);

    expect(await Plans.record(ledger, Plans.answered('toolu_q1'), 5)).toBe(1);
  });

  it('drops the answer to a question a newer one has replaced', async () => {
    const ledger = new FileSessionLedger({ config: state.config });

    await Plans.record(ledger, Plans.asked('toolu_q1'), 0);
    await Plans.record(ledger, Plans.asked('toolu_q2'), 1);

    expect(
      await Plans.record(ledger, Plans.answered('toolu_q1'), 2),
    ).toBeUndefined();
    expect((await state.heartbeats('session-1')).at(-1)?.payload.status).toBe(
      'question',
    );
    expect(await Plans.record(ledger, Plans.answered('toolu_q2'), 3)).toBe(2);
  });

  it('drops an answer that arrives after the turn has finished', async () => {
    const ledger = new FileSessionLedger({ config: state.config });

    await Plans.record(ledger, Plans.asked('toolu_q1'), 0);
    await Plans.record(ledger, Plans.make('complete'), 1);

    expect(
      await Plans.record(ledger, Plans.answered('toolu_q1'), 2),
    ).toBeUndefined();
    expect((await state.heartbeats('session-1')).at(-1)?.payload.status).toBe(
      'complete',
    );
  });
});

describe('FileSessionLedger sequence', () => {
  it('continues the sequence in a new process for a resumed session', async () => {
    await Plans.record(
      new FileSessionLedger({ config: state.config }),
      Plans.make('working'),
      0,
    );
    await Plans.record(
      new FileSessionLedger({ config: state.config }),
      Plans.make('complete'),
      1,
    );

    const resumed = new FileSessionLedger({ config: state.config });

    expect(await Plans.record(resumed, Plans.make('working'), 3600)).toBe(2);
  });

  it('gives concurrent writers distinct seq values in line order', async () => {
    const writes = Array.from({ length: 25 }, (_, index) =>
      Plans.record(
        new FileSessionLedger({ config: state.config }),
        Plans.make('working', 'always', `agent-${index}`),
        index,
      ),
    );
    await Promise.all(writes);

    const seqs = (await state.heartbeats('session-1')).map(
      ({ payload }) => payload.seq,
    );
    expect(seqs).toEqual(Array.from({ length: 25 }, (_, index) => index));
  });
});

describe('FileSessionLedger state files', () => {
  it('loads a state file written before background children were tracked', async () => {
    const ledger = new FileSessionLedger({ config: state.config });
    await mkdir(state.config.sessionsDirectory, { recursive: true });
    await writeFile(
      path.join(state.config.sessionsDirectory, 'session-1.json'),
      JSON.stringify({
        nextSeq: 7,
        lastWrittenAt: start,
        agents: { 'agent-a': 'working' },
        awaitingAnswer: {},
        ended: false,
      }),
    );

    expect(
      await Plans.record(
        ledger,
        Plans.make('complete', 'known-subagent', 'agent-a'),
        1,
      ),
    ).toBe(7);
  });

  it('forgets a child once it has finished', async () => {
    const ledger = new FileSessionLedger({ config: state.config });
    const stopping = {
      ...Plans.make('complete', 'known-subagent', 'agent-a'),
      waitsOnRecordedChildren: true,
    };

    await Plans.record(ledger, Plans.make('working', 'always', 'agent-a'), 0);
    await Plans.record(
      ledger,
      {
        ...Plans.make('working', 'liveness', 'agent-a'),
        launchedChild: 'agent-b',
      },
      1,
    );
    await Plans.record(ledger, Plans.make('complete', 'always', 'agent-b'), 2);
    await Plans.record(ledger, stopping, 3);

    const text = await readFile(
      path.join(state.config.sessionsDirectory, 'session-1.json'),
      'utf8',
    );
    expect(JSON.parse(text).children).toEqual({});
  });
});
