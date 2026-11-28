import { z } from 'zod';

import { briefingCountsSchema } from '#src/briefing/contracts/briefing-snapshot.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const briefingTriggerSchema = z.enum(['scheduled', 'manual']);

export const briefingStatusSchema = z
  .enum(['succeeded', 'failed', 'skipped_over_budget'])
  .describe(
    '`skipped_over_budget` runs never called the model and cost nothing. `failed` runs may still have cost tokens.',
  );

export const briefingPricesSchema = z
  .object({
    inputUsdPerMTok: z.number().nonnegative(),
    cachedInputUsdPerMTok: z.number().nonnegative(),
    outputUsdPerMTok: z.number().nonnegative(),
  })
  .describe('What the run was charged per million tokens.');

export const briefingParagraphSchema = z
  .array(
    z.object({
      text: z.string(),
      href: z.url().nullable(),
    }),
  )
  .describe('One paragraph as text segments, each optionally a link.');

export const briefingRunSchema = z.object({
  id: z.uuid(),
  trigger: briefingTriggerSchema,
  status: briefingStatusSchema,
  startedAt: timestampSchema,
  finishedAt: timestampSchema,
  snapshotAt: timestampSchema
    .nullable()
    .describe('When the data was read. Null for a run skipped over budget.'),
  model: z.string().nullable(),
  tokens: z.object({
    input: z.int().nonnegative(),
    cachedInput: z.int().nonnegative(),
    output: z.int().nonnegative(),
    reasoning: z.int().nonnegative(),
  }),
  costUsd: z.number().nonnegative(),
  prices: briefingPricesSchema.nullable(),
  sourceCounts: briefingCountsSchema.nullable(),
  paragraphs: z.array(briefingParagraphSchema).nullable(),
  unknownRefs: z
    .int()
    .nonnegative()
    .describe('Citations in the writer’s text that named no item.'),
  error: z
    .string()
    .nullable()
    .describe('Why a failed or skipped run produced no briefing.'),
});

export const briefingBudgetSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/u)
    .describe('The budget month, YYYY-MM, in the owner’s time zone.'),
  spentUsd: z
    .number()
    .nonnegative()
    .describe('Spend of every person’s runs this month, failed runs included.'),
  capUsd: z.number().nonnegative(),
  reached: z.boolean(),
});

export const briefingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const briefingsSchema = z.object({
  configured: z.boolean(),
  latest: briefingRunSchema
    .nullable()
    .describe('The newest succeeded run, kept visible after a later failure.'),
  lastRun: briefingRunSchema
    .nullable()
    .describe('The newest run of any status.'),
  history: z.array(briefingRunSchema).describe('Newest first.'),
  budget: briefingBudgetSchema,
});

export type BriefingRun = z.infer<typeof briefingRunSchema>;
export type BriefingPrices = z.infer<typeof briefingPricesSchema>;
export type BriefingParagraph = z.infer<typeof briefingParagraphSchema>;
export type BriefingBudget = z.infer<typeof briefingBudgetSchema>;
export type Briefings = z.infer<typeof briefingsSchema>;
