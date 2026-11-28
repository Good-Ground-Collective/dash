const briefingHours: readonly number[] = [7, 9, 12, 17];

/** The briefing is written at 07:00, 09:00, 12:00 and 17:00 wherever the person is. */
export class BriefingSchedule {
  /**
   * True when `firedAt` falls in one of the briefing hours on the person's wall clock. The
   * check follows the zone's daylight-saving rules, so it holds across clock changes. A zone
   * on a half-hour offset gets its briefing at half past.
   */
  static isBriefingHour(props: { firedAt: Date; timeZone: string }): boolean {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: props.timeZone,
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(props.firedAt),
    );
    return briefingHours.includes(hour);
  }
}
