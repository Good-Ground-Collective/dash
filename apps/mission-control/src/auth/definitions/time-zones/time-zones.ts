import { z } from 'zod';

const zoneNamePattern = /^[A-Za-z][\w+-]*(?:\/[\w+-]+)*$/u;

/** IANA time zone names, as the runtime's time zone database knows them. */
export class IanaTimeZones {
  /** Where a person is until one of their browsers reports a zone. */
  static readonly FALLBACK = 'America/New_York';

  /** True for a named zone such as `Europe/London` or `UTC`. An offset such as `+05:00` isn't one. */
  static knows(name: string): boolean {
    if (!zoneNamePattern.test(name)) return false;

    try {
      Intl.DateTimeFormat('en-US', { timeZone: name });
      return true;
    } catch {
      return false;
    }
  }
}

export const timeZoneSchema = z
  .string()
  .max(64)
  .refine((name) => IanaTimeZones.knows(name), {
    message: 'Not an IANA time zone name',
  })
  .describe(
    'An IANA time zone name, such as `America/New_York`. The briefing schedule and spend month follow it.',
  );

export type TimeZone = z.infer<typeof timeZoneSchema>;
