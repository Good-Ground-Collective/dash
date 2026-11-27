import { z } from 'zod';

export const healthReportSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.record(z.string(), z.enum(['ok', 'failing'])),
  version: z
    .string()
    .optional()
    .describe(
      'The release tag, such as `v1.1.1`, or `dev` for a build without one.',
    ),
  commit: z
    .string()
    .optional()
    .describe('The commit SHA the image was built from. Absent when unknown.'),
});

export const buildInfoSchema = z.object({
  version: z.string(),
  commit: z.string().nullable(),
});

export type BuildInfo = z.infer<typeof buildInfoSchema>;

export type HealthReport = z.infer<typeof healthReportSchema>;
