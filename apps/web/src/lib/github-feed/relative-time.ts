const units: readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] =
  [
    { unit: 'year', seconds: 365 * 24 * 60 * 60 },
    { unit: 'month', seconds: 30 * 24 * 60 * 60 },
    { unit: 'week', seconds: 7 * 24 * 60 * 60 },
    { unit: 'day', seconds: 24 * 60 * 60 },
    { unit: 'hour', seconds: 60 * 60 },
    { unit: 'minute', seconds: 60 },
  ];

const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** How long ago something happened, in the words a row shows. */
export class RelativeTime {
  /** “just now” under a minute, then “5 minutes ago”, “yesterday”, “3 weeks ago”. A time in the future reads as just now. */
  static since(when: Date): string {
    const seconds = Math.max(0, (Date.now() - when.getTime()) / 1000);
    const match = units.find((entry) => seconds >= entry.seconds);
    if (match === undefined) return 'just now';
    return format.format(-Math.floor(seconds / match.seconds), match.unit);
  }

  /** Whether `when` is more than `minutes` ago. */
  static olderThan(props: { when: Date; minutes: number }): boolean {
    return Date.now() - props.when.getTime() > props.minutes * 60 * 1000;
  }
}
