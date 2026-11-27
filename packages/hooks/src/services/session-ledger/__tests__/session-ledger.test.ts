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
