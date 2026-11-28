import { describe, expect, it } from 'vitest';

import { IanaTimeZones } from '#src/auth/definitions/time-zones/time-zones.ts';
import { BudgetMonth } from '#src/briefing/services/budget-month/budget-month.ts';

describe('BudgetMonth', () => {
  it('starts the month at local midnight on the 1st', () => {
    const month = BudgetMonth.of({
      now: new Date('2026-11-27T15:30:00Z'),
      timeZone: 'America/New_York',
    });

    expect(month.label).toBe('2026-11');
    expect(month.startsAt.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('still belongs to the old month just before local midnight on the 1st', () => {
    const before = BudgetMonth.of({
      now: new Date('2026-12-01T04:59:59Z'),
      timeZone: 'America/New_York',
    });
    const after = BudgetMonth.of({
      now: new Date('2026-12-01T05:00:00Z'),
      timeZone: 'America/New_York',
    });

    expect(before.label).toBe('2026-11');
    expect(after.label).toBe('2026-12');
    expect(after.startsAt.toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('uses the offset in force on the 1st when daylight saving changed during the month', () => {
    const march = BudgetMonth.of({
      now: new Date('2026-03-31T12:00:00Z'),
      timeZone: 'America/New_York',
    });
    const april = BudgetMonth.of({
      now: new Date('2026-04-15T12:00:00Z'),
      timeZone: 'America/New_York',
    });

    expect(march.startsAt.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(april.startsAt.toISOString()).toBe('2026-04-01T04:00:00.000Z');
  });

  it('follows a zone ahead of UTC into the next month early', () => {
    const month = BudgetMonth.of({
      now: new Date('2026-11-30T23:00:00Z'),
      timeZone: 'Pacific/Auckland',
    });

    expect(month.label).toBe('2026-12');
    expect(month.startsAt.toISOString()).toBe('2026-11-30T11:00:00.000Z');
  });

  it('handles a zone behind UTC that has no daylight saving', () => {
    const month = BudgetMonth.of({
      now: new Date('2026-09-10T12:00:00Z'),
      timeZone: 'America/Sao_Paulo',
    });

    expect(month.label).toBe('2026-09');
    expect(month.startsAt.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });
});

describe('BudgetMonth edge cases', () => {
  it('starts the month at the first instant of the 1st when daylight saving skips local midnight', () => {
    const month = BudgetMonth.of({
      now: new Date('2023-10-15T12:00:00Z'),
      timeZone: 'America/Asuncion',
    });

    expect(month.label).toBe('2023-10');
    expect(month.startsAt.toISOString()).toBe('2023-10-01T04:00:00.000Z');
  });

  it('reads a zone the runtime rejects as the fallback zone', () => {
    const now = new Date('2026-11-27T15:30:00Z');

    expect(BudgetMonth.of({ now, timeZone: 'Not/AZone' })).toEqual(
      BudgetMonth.of({ now, timeZone: IanaTimeZones.FALLBACK }),
    );
  });
});
