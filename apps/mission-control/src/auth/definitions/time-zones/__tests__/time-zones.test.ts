import { describe, expect, it } from 'vitest';

import { timeZoneSchema } from '#src/auth/definitions/time-zones/time-zones.ts';

describe('timeZoneSchema', () => {
  it.each(['America/New_York', 'Europe/London', 'Asia/Kolkata', 'UTC'])(
    'accepts %s',
    (name) => {
      expect(timeZoneSchema.safeParse(name).success).toBe(true);
    },
  );

  it.each(['Mars/Olympus_Mons', '+05:00', 'America/New York', ''])(
    'refuses %j',
    (name) => {
      expect(timeZoneSchema.safeParse(name).success).toBe(false);
    },
  );
});
