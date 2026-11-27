import { z } from 'zod';

export const providerIdSchema = z
  .string()
  .regex(/^[a-z][a-z\d-]*$/u)
  .describe('The provider that owns the record, such as `github` or `jira`.');

/** Identity every provider-neutral record carries, so Dash can key and deep-link it. */
export const externalRecordSchema = z.object({
  provider: providerIdSchema,
  externalId: z
    .string()
    .min(1)
    .describe(
      'Assigned by the provider and stable across renames and moves. Unique within the provider.',
    ),
  url: z.url().describe('Opens the record in the provider.'),
});

export type ExternalRecord = z.infer<typeof externalRecordSchema>;
