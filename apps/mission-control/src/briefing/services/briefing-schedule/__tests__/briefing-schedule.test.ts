import { describe, expect, it } from 'vitest';

import { BriefingSchedule } from '#src/briefing/services/briefing-schedule/briefing-schedule.ts';

class FiredOn {
  static utcHours(props: { day: string; timeZone: string }): number[] {
    return Array.from({ length: 24 }, (_, hour) => hour).filter((hour) =>
      BriefingSchedule.isBriefingHour({
        firedAt: new Date(
          `${props.day}T${String(hour).padStart(2, '0')}:00:00Z`,
        ),
        timeZone: props.timeZone,
      }),
    );
  }
}

describe('BriefingSchedule', () => {
  it('fires at 07, 09, 12 and 17 local time in standard time', () => {
    expect(
      FiredOn.utcHours({ day: '2026-01-15', timeZone: 'America/New_York' }),
    ).toEqual([12, 14, 17, 22]);
  });

  it('fires an hour earlier in UTC in daylight time', () => {
    expect(
      FiredOn.utcHours({ day: '2026-07-15', timeZone: 'America/New_York' }),
    ).toEqual([11, 13, 16, 21]);
  });

  it('moves to daylight-time hours on the spring-forward day', () => {
    expect(
      FiredOn.utcHours({ day: '2026-03-08', timeZone: 'America/New_York' }),
    ).toEqual([11, 13, 16, 21]);
  });

  it('keeps standard-time hours from the fall-back morning', () => {
    expect(
      FiredOn.utcHours({ day: '2026-11-01', timeZone: 'America/New_York' }),
    ).toEqual([12, 14, 17, 22]);
  });

  it('follows each person’s own zone', () => {
    expect(
      FiredOn.utcHours({ day: '2026-11-27', timeZone: 'Asia/Tokyo' }),
    ).toEqual([0, 3, 8, 22]);
  });
});
