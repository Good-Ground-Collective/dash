/** How Settings names a time zone. */
export class TimeZoneWording {
  /** A readable name such as “Eastern Time”, or `null` when the runtime has none or doesn't know the zone. */
  static label(timeZone: string): string | null {
    try {
      const name = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'longGeneric',
      })
        .formatToParts(0)
        .find((part) => part.type === 'timeZoneName')?.value;
      return name === undefined || name.startsWith('GMT') ? null : name;
    } catch {
      return null;
    }
  }
}
