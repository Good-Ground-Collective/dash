import { DBOS } from '@dbos-inc/dbos-sdk';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
  vi,
} from 'vitest';

import { BriefingRuns } from '#src/briefing/__tests__/support/briefing-runs.ts';
import {
  BriefingWorkflowsFixture,
  settle,
  worstCaseMicroUsd,
  writtenSections,
} from '#src/briefing/__tests__/support/briefing-workflows-fixture.ts';
import {
  BriefingNotConfiguredError,
  BriefingNotRegisteredError,
  BriefingWriteFailedError,
} from '#src/briefing/errors.ts';
import {
  adaId,
  graceId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';

const databaseUrl = inject('databaseUrl');
const fixture = new BriefingWorkflowsFixture();
const { briefings, writer, workflows } = fixture;
beforeAll(async () => {
  if (databaseUrl !== null) {
    await fixture.launch({
      databaseUrl,
      database: 'dash_test_briefing_workflows',
    });
  }
});

beforeEach(() => {
  fixture.begin();
});

afterEach(async () => {
  fixture.end();
  if (databaseUrl !== null) {
    await vi.waitFor(async () => {
      expect(await fixture.unfinished()).toHaveLength(0);
    }, settle);
  }
});

afterAll(async () => {
  await fixture.stop();
});

describe('DbosBriefingWorkflows before registration', () => {
  const unregistered = BriefingWorkflowsFixture.unregistered({
    configured: true,
  });

  it('refuses to activate', async () => {
    await expect(unregistered.activate()).rejects.toThrow(
      BriefingNotRegisteredError,
    );
  });

  it('refuses to start a run', async () => {
    await expect(
      unregistered.regenerate({ userId: adaId, trigger: 'manual' }),
    ).rejects.toThrow(BriefingNotRegisteredError);
  });
});

describe('DbosBriefingWorkflows without a configured writer', () => {
  it('refuses to start a run', async () => {
    const off = BriefingWorkflowsFixture.unregistered({ configured: false });

    await expect(
      off.regenerate({ userId: adaId, trigger: 'manual' }),
    ).rejects.toThrow(BriefingNotConfiguredError);
  });
});

describe.skipIf(databaseUrl === null)('DbosBriefingWorkflows schedule', () => {
  it('queues a run for each person whose clock reads a briefing hour when the schedule fires', async () => {
    fixture.people.zones = {
      [adaId]: BriefingWorkflowsFixture.zoneWhereItIsNow(12),
      [graceId]: BriefingWorkflowsFixture.zoneWhereItIsNow(13),
    };
    const before = (await fixture.started()).length;

    await DBOS.triggerSchedule('briefing-hourly');

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(1);
    }, settle);
    expect(briefings.briefings[0]).toMatchObject({ userId: adaId });
    expect(briefings.briefings[0]?.run).toMatchObject({
      trigger: 'scheduled',
      status: 'succeeded',
    });
    expect((await fixture.started()).length - before).toBe(1);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('DbosBriefingWorkflows runs', () => {
  it('publishes progress through each stage and then the finished run, with ids only', async () => {
    const { runId } = await workflows.regenerate({
      userId: adaId,
      trigger: 'manual',
    });

    await vi.waitFor(() => {
      expect(fixture.eventTypes()).toContain('briefing.ready');
    }, settle);

    const [recorded] = briefings.briefings;
    expect(fixture.events).toEqual([
      { type: 'briefing.progress', data: { runId, stage: 'snapshot' } },
      { type: 'briefing.progress', data: { runId, stage: 'writing' } },
      { type: 'briefing.progress', data: { runId, stage: 'saving' } },
      {
        type: 'briefing.ready',
        data: { runId, briefingId: recorded?.run.id, status: 'succeeded' },
      },
    ]);
    expect(recorded?.run).toMatchObject({
      trigger: 'manual',
      model: 'gpt-test',
      sections: writtenSections,
      paragraphs: null,
    });
  }, 30_000);

  it('gives two requests during a held run one run and says it is running', async () => {
    writer.held = true;
    const before = (await fixture.started()).length;

    const first = await workflows.regenerate({
      userId: adaId,
      trigger: 'manual',
    });
    await vi.waitFor(() => {
      expect(writer.calls).toBe(1);
    }, settle);
    const second = await workflows.regenerate({
      userId: adaId,
      trigger: 'scheduled',
    });

    expect(second).toEqual(first);
    expect((await fixture.started()).length - before).toBe(1);
    await expect(workflows.running({ userId: adaId })).resolves.toMatchObject({
      runId: first.runId,
    });
    await expect(workflows.running({ userId: graceId })).resolves.toBeNull();

    writer.release();
    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(1);
    }, settle);
    expect(writer.calls).toBe(1);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('DbosBriefingWorkflows window', () => {
  it('reads from the snapshotAt of the last succeeded run, not a later failed one', async () => {
    const snapshotAt = new Date('2026-11-26T10:30:00Z');
    await briefings.record(
      BriefingRuns.succeeded({
        startedAt: new Date('2026-11-26T11:00:00Z'),
        snapshotAt,
        costMicroUsd: 0,
      }),
    );
    await briefings.record(
      BriefingRuns.failed({
        startedAt: new Date('2026-11-26T12:00:00Z'),
        costMicroUsd: 0,
      }),
    );

    await workflows.regenerate({ userId: adaId, trigger: 'manual' });

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(3);
    }, settle);
    expect(fixture.snapshot.previousBriefingAts).toEqual([snapshotAt]);
  }, 30_000);

  it('reads with no start when no run has succeeded', async () => {
    await briefings.record(
      BriefingRuns.failed({
        startedAt: new Date('2026-11-26T12:00:00Z'),
        costMicroUsd: 0,
      }),
    );

    await workflows.regenerate({ userId: adaId, trigger: 'manual' });

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(2);
    }, settle);
    expect(fixture.snapshot.previousBriefingAts).toEqual([null]);
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('DbosBriefingWorkflows budget', () => {
  it('records a skipped run and never calls the writer when the worst case of both attempts would pass the budget', async () => {
    await briefings.record(
      BriefingRuns.succeeded({
        startedAt: new Date(),
        costMicroUsd: 1_000_000 - 2 * worstCaseMicroUsd + 1,
      }),
    );

    await workflows.regenerate({ userId: adaId, trigger: 'manual' });

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(2);
    }, settle);
    const skipped = briefings.briefings[1]?.run;
    expect(skipped).toMatchObject({
      status: 'skipped_over_budget',
      snapshotAt: null,
      costUsd: 0,
    });
    expect(skipped?.error).toContain('budget');
    expect(writer.calls).toBe(0);
    await vi.waitFor(() => {
      expect(fixture.eventTypes()).toContain('briefing.ready');
    }, settle);
    expect(fixture.events.at(-1)).toMatchObject({
      data: { status: 'skipped_over_budget', briefingId: skipped?.id },
    });
  }, 30_000);

  it('still writes when the worst case of both attempts lands exactly on the budget', async () => {
    await briefings.record(
      BriefingRuns.succeeded({
        startedAt: new Date(),
        costMicroUsd: 1_000_000 - 2 * worstCaseMicroUsd,
      }),
    );

    await workflows.regenerate({ userId: adaId, trigger: 'manual' });

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(2);
    }, settle);
    expect(briefings.briefings[1]?.run.status).toBe('succeeded');
  }, 30_000);
});

describe.skipIf(databaseUrl === null)('DbosBriefingWorkflows failures', () => {
  it('records a failed run with the spend the writer reports and keeps the last good briefing', async () => {
    const good = await briefings.record(
      BriefingRuns.succeeded({
        startedAt: new Date(Date.now() - 60_000),
        costMicroUsd: 0,
      }),
    );
    const failure = new BriefingWriteFailedError({
      reason: 'ceiling',
      model: 'gpt-test',
      tokens: { input: 900, cachedInput: 0, output: 4000, reasoning: 3000 },
      costMicroUsd: 1234,
    });
    writer.queue(failure);

    await workflows.regenerate({ userId: adaId, trigger: 'manual' });

    await vi.waitFor(() => {
      expect(briefings.briefings).toHaveLength(2);
    }, settle);
    const stored = briefings.briefings[1];
    expect(stored?.costMicroUsd).toBe(1234);
    expect(stored?.run).toMatchObject({
      status: 'failed',
      model: 'gpt-test',
      sections: null,
      error: failure.message,
    });
    await expect(briefings.latestSucceeded({ userId: adaId })).resolves.toEqual(
      good,
    );
    await vi.waitFor(() => {
      expect(fixture.events.at(-1)).toMatchObject({
        type: 'briefing.ready',
        data: { status: 'failed' },
      });
    }, settle);
  }, 30_000);
});
