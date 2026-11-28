import { z } from 'zod';

export const ingestResultSchema = z.discriminatedUnion('outcome', [
  z.looseObject({ outcome: z.literal('created') }),
  z.looseObject({ outcome: z.literal('duplicate') }),
  z.looseObject({
    outcome: z.literal('invalid'),
    issues: z.array(z.object({ path: z.string(), message: z.string() })),
  }),
]);

/** What Mission Control did with one heartbeat in a batch. All three mean the relay can move past it. */
export type IngestResult = z.output<typeof ingestResultSchema>;

export const ingestResultsSchema = z.object({
  results: z.array(ingestResultSchema),
});
