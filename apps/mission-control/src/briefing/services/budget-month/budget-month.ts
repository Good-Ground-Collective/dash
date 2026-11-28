/** A calendar month as the owner lives it. */
export interface BudgetMonthWindow {
  /** `YYYY-MM`. */
  label: string;
  /** The instant local midnight began on the 1st. */
  startsAt: Date;
}

/** The monthly budget resets at local midnight on the 1st, in the owner's time zone. */
export class BudgetMonth {
  /** The month containing `now` in `timeZone`. */
  static of(props: { now: Date; timeZone: string }): BudgetMonthWindow {
    const local = BudgetMonth.localParts(props.now, props.timeZone);
    const firstOfMonthUtc = Date.UTC(local.year, local.month - 1, 1);

    let startsAt = firstOfMonthUtc - BudgetMonth.offset(firstOfMonthUtc, props);
    startsAt = firstOfMonthUtc - BudgetMonth.offset(startsAt, props);

    return {
      label: `${local.year}-${String(local.month).padStart(2, '0')}`,
      startsAt: new Date(startsAt),
    };
  }

  private static offset(instant: number, props: { timeZone: string }): number {
    const local = BudgetMonth.localParts(new Date(instant), props.timeZone);
    return (
      Date.UTC(
        local.year,
        local.month - 1,
        local.day,
        local.hour,
        local.minute,
        local.second,
      ) -
      Math.floor(instant / 1000) * 1000
    );
  }

  private static localParts(instant: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(instant);
    const value = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value);

    return {
      year: value('year'),
      month: value('month'),
      day: value('day'),
      hour: value('hour'),
      minute: value('minute'),
      second: value('second'),
    };
  }
}
