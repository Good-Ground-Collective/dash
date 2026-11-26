import { z } from 'zod';

export const healthReportSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.record(z.string(), z.enum(['ok', 'failing'])),
});

export type HealthReport = z.infer<typeof healthReportSchema>;
