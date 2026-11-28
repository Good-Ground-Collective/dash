import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BriefingRuns } from '#src/briefing/__tests__/support/briefing-runs.ts';
import { BriefingsHarness } from '#src/briefing/__tests__/support/briefings-harness.ts';
import {
  type Briefings,
  briefingsSchema,
} from '#src/briefing/contracts/briefings.ts';
import {
  adaId,
  fixedNow,
  graceId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';

const running: BriefingsHarness[] = [];

class Served {
  static harness(
    props: ConstructorParameters<typeof BriefingsHarness>[0] = {},
  ): BriefingsHarness {
    const harness = new BriefingsHarness(props);
    running.push(harness);
    return harness;
  }

  static async briefings(
    harness: BriefingsHarness,
    query = '',
    userId = adaId,
  ): Promise<Briefings> {
    const response = await (
      await harness.start()
    ).inject({
      url: `/briefings${query}`,
      headers: BriefingsHarness.cookie(userId),
    });
    expect(response.statusCode).toBe(200);
    return briefingsSchema.parse(response.json());
  }

  static hoursAgo(hours: number): Date {
    return new Date(fixedNow.getTime() - hours * 60 * 60 * 1000);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: fixedNow });
});

afterEach(async () => {
  await Promise.all(running.splice(0).map(async (harness) => harness.stop()));
  vi.useRealTimers();
});

describe('GET /briefings', () => {
  it('needs a signed-in person', async () => {
    const harness = Served.harness();

    const response = await (
      await harness.start()
    ).inject({ url: '/briefings' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
  });

  it('says it is not configured, with nothing listed, when OpenAI is off', async () => {
    const harness = Served.harness({ configured: false });
    await harness.briefings.record(BriefingRuns.succeeded());

    await expect(Served.briefings(harness)).resolves.toEqual({
      configured: false,
      latest: null,
      lastRun: null,
      history: [],
      budget: { month: '2026-11', spentUsd: 0, capUsd: 0, reached: false },
      running: null,
    });
  });

  it('is empty but configured before the first run', async () => {
    const harness = Served.harness();

    await expect(Served.briefings(harness)).resolves.toEqual({
      configured: true,
      latest: null,
      lastRun: null,
      history: [],
      budget: { month: '2026-11', spentUsd: 0, capUsd: 1, reached: false },
      running: null,
    });
  });

  it('keeps the last good briefing as latest after a failed run', async () => {
    const harness = Served.harness();
    const good = await harness.briefings.record(
      BriefingRuns.succeeded({ startedAt: Served.hoursAgo(5) }),
    );
    const failed = await harness.briefings.record(
      BriefingRuns.failed({ startedAt: Served.hoursAgo(1) }),
    );

    const body = await Served.briefings(harness);

    expect(body.latest).toEqual(good);
    expect(body.lastRun).toEqual(failed);
    expect(body.lastRun?.error).toBe('OpenAI answered 500');
    expect(body.history.map(({ id }) => id)).toEqual([failed.id, good.id]);
  });
});

describe('GET /briefings running', () => {
  it('shows the signed-in person’s run in progress and nobody else’s', async () => {
    const harness = Served.harness();
    await harness.workflows.regenerate({ userId: adaId, trigger: 'manual' });

    const own = await Served.briefings(harness);
    const other = await Served.briefings(harness, '', graceId);

    expect(own.running).toEqual({
      runId: 'run-1',
      startedAt: '2026-11-27T09:00:00.000Z',
    });
    expect(other.running).toBeNull();
  });
});

describe('POST /briefing/regenerate', () => {
  class Regenerated {
    static async post(
      harness: BriefingsHarness,
      headers: Record<string, string> = {},
    ) {
      return (await harness.start()).inject({
        method: 'POST',
        url: '/briefing/regenerate',
        headers,
      });
    }
  }

  it('needs a signed-in person', async () => {
    const harness = Served.harness();

    const response = await Regenerated.post(harness);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SIGN_IN_REQUIRED' });
    expect(harness.workflows.requests).toEqual([]);
  });

  it('answers 409 when the briefing is not configured', async () => {
    const harness = Served.harness({ configured: false });

    const response = await Regenerated.post(
      harness,
      BriefingsHarness.cookie(adaId),
    );

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'BRIEFING_NOT_CONFIGURED' });
    expect(harness.workflows.requests).toEqual([]);
  });

  it('accepts with the id of the run it started, as a manual run', async () => {
    const harness = Served.harness();

    const response = await Regenerated.post(
      harness,
      BriefingsHarness.cookie(adaId),
    );

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ runId: 'run-1' });
    expect(harness.workflows.requests).toEqual([
      { userId: adaId, trigger: 'manual' },
    ]);
  });

  it('answers with the same id while the person’s run is still in flight', async () => {
    const harness = Served.harness();
    const headers = BriefingsHarness.cookie(adaId);

    const first = await Regenerated.post(harness, headers);
    const second = await Regenerated.post(harness, headers);

    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual(first.json());
  });
});

describe('GET /briefings budget', () => {
  it('shows a person only their own runs but spend from everyone', async () => {
    const harness = Served.harness();
    await harness.briefings.record(
      BriefingRuns.succeeded({ costMicroUsd: 100_000 }),
    );
    await harness.briefings.record(
      BriefingRuns.failed({ userId: graceId, costMicroUsd: 200_000 }),
    );

    const body = await Served.briefings(harness);

    expect(body.history).toHaveLength(1);
    expect(body.budget.spentUsd).toBeCloseTo(0.3);
  });

  it('counts only spend since the month began in the owner’s zone', async () => {
    const harness = Served.harness();
    await harness.briefings.record(
      BriefingRuns.succeeded({
        startedAt: new Date('2026-11-01T03:59:59Z'),
        costMicroUsd: 700_000,
      }),
    );
    await harness.briefings.record(
      BriefingRuns.succeeded({
        startedAt: new Date('2026-11-01T04:00:00Z'),
        costMicroUsd: 400_000,
      }),
    );

    const { budget } = await Served.briefings(harness);

    expect(budget).toEqual({
      month: '2026-11',
      spentUsd: 0.4,
      capUsd: 1,
      reached: false,
    });
  });

  it('reaches the budget exactly at the cap', async () => {
    const harness = Served.harness({ monthlyBudgetUsd: 0.5 });
    await harness.briefings.record(
      BriefingRuns.succeeded({ costMicroUsd: 500_000 }),
    );

    const { budget } = await Served.briefings(harness);

    expect(budget).toMatchObject({ spentUsd: 0.5, capUsd: 0.5, reached: true });
  });
});

describe('GET /briefings limit', () => {
  it('returns 30 runs by default and at most the limit asked for', async () => {
    const harness = Served.harness();
    for (let hour = 1; hour <= 40; hour += 1) {
      await harness.briefings.record(
        BriefingRuns.succeeded({ startedAt: Served.hoursAgo(hour) }),
      );
    }

    expect((await Served.briefings(harness)).history).toHaveLength(30);
    expect((await Served.briefings(harness, '?limit=5')).history).toHaveLength(
      5,
    );
  });

  it('rejects a limit above 100', async () => {
    const harness = Served.harness();

    const response = await (
      await harness.start()
    ).inject({
      url: '/briefings?limit=101',
      headers: BriefingsHarness.cookie(adaId),
    });

    expect(response.statusCode).toBe(400);
  });
});
