import { describe, expect, it } from 'vitest';

import { adaId } from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import { BriefingRuns } from '#src/briefing/__tests__/support/briefing-runs.ts';
import {
  FixedOwnerTimeZone,
  InMemoryBriefingRepository,
} from '#src/briefing/__tests__/support/in-memory-briefings.ts';
import { BriefingNotRegisteredError } from '#src/briefing/errors.ts';
import { DbosBriefingRetention } from '#src/briefing/services/briefing-retention/briefing-retention.ts';

class Stored {
  static async briefings(startedAt: Record<string, Date>) {
    const briefings = new InMemoryBriefingRepository();
    for (const started of Object.values(startedAt)) {
      await briefings.record(BriefingRuns.succeeded({ startedAt: started }));
    }
    return briefings;
  }

  static starts(briefings: InMemoryBriefingRepository): string[] {
    return briefings.briefings.map(({ startedAt }) => startedAt.toISOString());
  }

  static retention(props: {
    briefings: InMemoryBriefingRepository;
    timeZone: string;
  }) {
    return new DbosBriefingRetention({
      briefings: props.briefings,
      ownerTimeZone: new FixedOwnerTimeZone({ timeZone: props.timeZone }),
    });
  }
}

describe('DbosBriefingRetention', () => {
  it('deletes runs older than 30 days and keeps one exactly at the cutoff', async () => {
    const now = new Date('2026-11-05T04:00:00Z');
    const briefings = await Stored.briefings({
      old: new Date('2026-10-06T03:59:59Z'),
      edge: new Date('2026-10-06T04:00:00Z'),
      recent: new Date('2026-11-04T04:00:00Z'),
    });

    await expect(
      Stored.retention({ briefings, timeZone: 'UTC' }).prune({ now }),
    ).resolves.toBe(1);
    expect(Stored.starts(briefings)).toEqual([
      '2026-10-06T04:00:00.000Z',
      '2026-11-04T04:00:00.000Z',
    ]);
  });

  it('prunes at the start of the budget month when that is earlier than 30 days ago', async () => {
    const now = new Date('2026-12-31T04:00:00Z');
    const briefings = await Stored.briefings({
      lastMonth: new Date('2026-11-30T23:59:59Z'),
      monthStart: new Date('2026-12-01T00:00:00Z'),
      thirtyDaysAgo: new Date('2026-12-01T04:00:00Z'),
    });

    await expect(
      Stored.retention({ briefings, timeZone: 'UTC' }).prune({ now }),
    ).resolves.toBe(1);
    expect(Stored.starts(briefings)).toEqual([
      '2026-12-01T00:00:00.000Z',
      '2026-12-01T04:00:00.000Z',
    ]);
  });

  it('starts the month at midnight in the owner’s zone, not UTC', async () => {
    const now = new Date('2026-12-31T12:00:00Z');
    const briefings = await Stored.briefings({
      beforeLocalMonth: new Date('2026-12-01T04:59:59Z'),
      atLocalMonth: new Date('2026-12-01T05:00:00Z'),
    });

    await expect(
      Stored.retention({ briefings, timeZone: 'America/New_York' }).prune({
        now,
      }),
    ).resolves.toBe(1);
    expect(Stored.starts(briefings)).toEqual(['2026-12-01T05:00:00.000Z']);
  });
});

describe('DbosBriefingRetention edge cases', () => {
  it('deletes runs whose person was removed once they pass the cutoff', async () => {
    const briefings = await Stored.briefings({
      old: new Date('2026-10-06T03:59:59Z'),
      recent: new Date('2026-11-04T04:00:00Z'),
    });
    briefings.removePerson({ userId: adaId });

    await expect(
      Stored.retention({ briefings, timeZone: 'UTC' }).prune({
        now: new Date('2026-11-05T04:00:00Z'),
      }),
    ).resolves.toBe(1);
    expect(Stored.starts(briefings)).toEqual(['2026-11-04T04:00:00.000Z']);
  });

  it('prunes as if the owner were in the fallback zone when the stored zone is not recognised', async () => {
    const briefings = await Stored.briefings({
      beforeLocalMonth: new Date('2026-12-01T04:59:59Z'),
      atLocalMonth: new Date('2026-12-01T05:00:00Z'),
    });

    await expect(
      Stored.retention({ briefings, timeZone: 'Not/AZone' }).prune({
        now: new Date('2026-12-31T12:00:00Z'),
      }),
    ).resolves.toBe(1);
    expect(Stored.starts(briefings)).toEqual(['2026-12-01T05:00:00.000Z']);
  });
});

describe('DbosBriefingRetention scheduling', () => {
  it('keeps everything when nothing is older than the cutoff', async () => {
    const briefings = await Stored.briefings({
      recent: new Date('2026-11-04T04:00:00Z'),
    });

    await expect(
      Stored.retention({ briefings, timeZone: 'UTC' }).prune({
        now: new Date('2026-11-05T04:00:00Z'),
      }),
    ).resolves.toBe(0);
    expect(briefings.briefings).toHaveLength(1);
  });

  it('refuses to schedule before its workflow is registered', async () => {
    const briefings = await Stored.briefings({});

    await expect(
      Stored.retention({ briefings, timeZone: 'UTC' }).activate(),
    ).rejects.toThrow(BriefingNotRegisteredError);
  });
});
