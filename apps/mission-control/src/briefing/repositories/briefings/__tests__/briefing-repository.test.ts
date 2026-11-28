import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from 'vitest';

import { eq } from 'drizzle-orm';

import { userTable } from '#src/auth/repositories/auth-store/auth-store-table.ts';
import { BriefingRuns } from '#src/briefing/__tests__/support/briefing-runs.ts';
import { BriefingsDatabase } from '#src/briefing/__tests__/support/briefings-database.ts';
import { briefingTable } from '#src/briefing/repositories/briefings/briefings-table.ts';
import {
  adaId,
  graceId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';

const databaseUrl = inject('databaseUrl');
let store: BriefingsDatabase | undefined;

beforeAll(async () => {
  if (databaseUrl !== null) {
    store = await BriefingsDatabase.open({
      serverUrl: databaseUrl,
      name: 'dash_test_briefing_repository',
    });
  }
});

beforeEach(async () => {
  await store?.reset();
});

afterAll(async () => {
  await store?.close();
});

class Hours {
  static at(hour: number) {
    return new Date(Date.UTC(2026, 10, 26, hour));
  }
}

describe.skipIf(databaseUrl === null)('DrizzleBriefingRepository', () => {
  it('records a run and reads it back in contract terms', async () => {
    const { briefings } = BriefingsDatabase.required(store);

    const recorded = await briefings.record(
      BriefingRuns.succeeded({ costMicroUsd: 1_234_567 }),
    );

    expect(recorded).toMatchObject({
      trigger: 'scheduled',
      status: 'succeeded',
      startedAt: '2026-11-26T11:00:00.000Z',
      finishedAt: '2026-11-26T11:00:05.000Z',
      model: 'gpt-6-luna',
      tokens: { input: 1000, cachedInput: 200, output: 300, reasoning: 100 },
      costUsd: 1.234567,
      unknownRefs: 0,
      error: null,
    });
    expect(recorded.paragraphs?.[0]?.[1]).toEqual({
      text: 'the pull request',
      href: 'https://github.com/acme/app/pull/1',
    });
    await expect(briefings.latestRun({ userId: adaId })).resolves.toEqual(
      recorded,
    );
  });

  it('keeps the last good briefing as latest when a later run failed', async () => {
    const { briefings } = BriefingsDatabase.required(store);
    const good = await briefings.record(
      BriefingRuns.succeeded({ startedAt: Hours.at(8) }),
    );
    const failed = await briefings.record(
      BriefingRuns.failed({ startedAt: Hours.at(9) }),
    );

    await expect(briefings.latestSucceeded({ userId: adaId })).resolves.toEqual(
      good,
    );
    await expect(briefings.latestRun({ userId: adaId })).resolves.toEqual(
      failed,
    );
  });
});

describe.skipIf(databaseUrl === null)('DrizzleBriefingRepository empty', () => {
  it('has no latest briefing before any run', async () => {
    const { briefings } = BriefingsDatabase.required(store);

    await expect(
      briefings.latestSucceeded({ userId: adaId }),
    ).resolves.toBeNull();
    await expect(briefings.latestRun({ userId: adaId })).resolves.toBeNull();
  });

  it('lists history newest first up to the limit', async () => {
    const { briefings } = BriefingsDatabase.required(store);
    for (const hour of [7, 19, 13]) {
      await briefings.record(
        BriefingRuns.succeeded({ startedAt: Hours.at(hour) }),
      );
    }

    const history = await briefings.history({ userId: adaId, limit: 2 });

    expect(history.map(({ startedAt }) => startedAt)).toEqual([
      '2026-11-26T19:00:00.000Z',
      '2026-11-26T13:00:00.000Z',
    ]);
  });
});

describe.skipIf(databaseUrl === null)(
  'DrizzleBriefingRepository queries',
  () => {
    it('keeps each person’s runs to themselves', async () => {
      const { briefings } = BriefingsDatabase.required(store);
      await briefings.record(BriefingRuns.succeeded({ userId: adaId }));

      await expect(
        briefings.history({ userId: graceId, limit: 10 }),
      ).resolves.toEqual([]);
      await expect(
        briefings.latestSucceeded({ userId: graceId }),
      ).resolves.toBeNull();
    });

    it('sums spend of every person’s runs since an instant, failed runs included', async () => {
      const { briefings } = BriefingsDatabase.required(store);
      await briefings.record(
        BriefingRuns.succeeded({
          startedAt: Hours.at(8),
          costMicroUsd: 300_000,
        }),
      );
      await briefings.record(
        BriefingRuns.failed({
          userId: graceId,
          startedAt: Hours.at(9),
          costMicroUsd: 120_000,
        }),
      );
      await briefings.record(BriefingRuns.skipped({ startedAt: Hours.at(10) }));
      await briefings.record(
        BriefingRuns.succeeded({
          startedAt: Hours.at(2),
          costMicroUsd: 9_000_000,
        }),
      );

      await expect(briefings.spentSince({ since: Hours.at(8) })).resolves.toBe(
        420_000,
      );
    });

    it('sums to zero when nothing was spent', async () => {
      const { briefings } = BriefingsDatabase.required(store);

      await expect(briefings.spentSince({ since: Hours.at(0) })).resolves.toBe(
        0,
      );
    });

    it('deletes runs started strictly before the cutoff and keeps one exactly at it', async () => {
      const { briefings } = BriefingsDatabase.required(store);
      for (const hour of [6, 8, 10]) {
        await briefings.record(
          BriefingRuns.succeeded({ startedAt: Hours.at(hour) }),
        );
      }

      await expect(
        briefings.deleteStartedBefore({ cutoff: Hours.at(8) }),
      ).resolves.toBe(1);

      const left = await briefings.history({ userId: adaId, limit: 10 });
      expect(left.map(({ startedAt }) => startedAt)).toEqual([
        '2026-11-26T10:00:00.000Z',
        '2026-11-26T08:00:00.000Z',
      ]);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleBriefingRepository when a person is deleted',
  () => {
    it('keeps their runs without an owner and the month’s spend unchanged', async () => {
      const { briefings, database } = BriefingsDatabase.required(store);
      await briefings.record(
        BriefingRuns.succeeded({
          userId: graceId,
          startedAt: Hours.at(8),
          costMicroUsd: 400_000,
        }),
      );
      await briefings.record(
        BriefingRuns.succeeded({
          startedAt: Hours.at(9),
          costMicroUsd: 100_000,
        }),
      );
      const before = await briefings.spentSince({ since: Hours.at(0) });

      await database.orm.delete(userTable).where(eq(userTable.id, graceId));

      await expect(briefings.spentSince({ since: Hours.at(0) })).resolves.toBe(
        before,
      );
      const rows = await database.orm
        .select({ userId: briefingTable.userId })
        .from(briefingTable)
        .orderBy(briefingTable.startedAt);
      expect(rows.map(({ userId }) => userId)).toEqual([null, adaId]);
    });

    it('never shows an ownerless run to anyone, and retention still deletes it', async () => {
      const { briefings, database } = BriefingsDatabase.required(store);
      await briefings.record(
        BriefingRuns.succeeded({ userId: graceId, startedAt: Hours.at(8) }),
      );
      await database.orm.delete(userTable).where(eq(userTable.id, graceId));

      await expect(
        briefings.history({ userId: adaId, limit: 10 }),
      ).resolves.toEqual([]);
      await expect(
        briefings.latestRun({ userId: adaId }),
      ).resolves.toBeNull();
      await expect(
        briefings.latestSucceeded({ userId: adaId }),
      ).resolves.toBeNull();
      await expect(
        briefings.deleteStartedBefore({ cutoff: Hours.at(9) }),
      ).resolves.toBe(1);
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleBriefingRepository run counts',
  () => {
    it('counts runs since the instant, failed runs included and skipped runs not', async () => {
      const { briefings } = BriefingsDatabase.required(store);
      await briefings.record(
        BriefingRuns.succeeded({ startedAt: Hours.at(8) }),
      );
      await briefings.record(
        BriefingRuns.failed({ userId: graceId, startedAt: Hours.at(9) }),
      );
      await briefings.record(BriefingRuns.skipped({ startedAt: Hours.at(10) }));
      await briefings.record(
        BriefingRuns.succeeded({ startedAt: Hours.at(2) }),
      );

      await expect(briefings.runsSince({ since: Hours.at(8) })).resolves.toBe(
        2,
      );
    });
  },
);

describe.skipIf(databaseUrl === null)(
  'DrizzleBriefingRepository constraints',
  () => {
    it('refuses a failed run without an error note', async () => {
      const { briefings } = BriefingsDatabase.required(store);

      await expect(
        briefings.record(BriefingRuns.failed({ error: null })),
      ).rejects.toThrow();
    });

    it('refuses negative token counts and cost', async () => {
      const { briefings } = BriefingsDatabase.required(store);

      await expect(
        briefings.record(
          BriefingRuns.succeeded({
            tokens: { input: -1, cachedInput: 0, output: 0, reasoning: 0 },
          }),
        ),
      ).rejects.toThrow();
      await expect(
        briefings.record(BriefingRuns.succeeded({ costMicroUsd: -1 })),
      ).rejects.toThrow();
    });
  },
);
