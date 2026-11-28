import { z } from 'zod';

import { timeZoneSchema } from '#src/auth/definitions/time-zones/time-zones.ts';

export const personTimeZoneSchema = z.object({
  timeZone: timeZoneSchema.describe(
    'The zone the person’s browser reports. The last browser to report wins.',
  ),
});

export type PersonTimeZone = z.infer<typeof personTimeZoneSchema>;
