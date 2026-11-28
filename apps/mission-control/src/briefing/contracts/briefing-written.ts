import { z } from 'zod';

import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingSentences } from '#src/briefing/services/briefing-sentences/briefing-sentences.ts';

export const briefingTokensSchema = z.object({
  input: z.int().nonnegative(),
  cachedInput: z.int().nonnegative(),
  output: z.int().nonnegative(),
  reasoning: z
    .int()
    .nonnegative()
    .describe('Already part of `output`; never add it again.'),
});

export const briefingPricesSchema = z.object({
  inputUsdPerMTok: z.number().nonnegative(),
  cachedInputUsdPerMTok: z.number().nonnegative(),
  outputUsdPerMTok: z.number().nonnegative(),
});

export const briefingSegmentSchema = z.object({
  text: z.string().min(1),
  url: z
    .url()
    .nullable()
    .describe(
      'The URL of the snapshot item the text cites. Taken from the snapshot, never from the model.',
    ),
});

export const briefingParagraphSchema = z.object({
  segments: z.array(briefingSegmentSchema).min(1),
});

const framingSchema = briefingParagraphSchema.refine(
  ({ segments }) =>
    BriefingSentences.isWithin({
      segments,
      ...briefingLimits.framingSentences,
    }),
  {
    message: `Expected ${briefingLimits.framingSentences.min} to ${briefingLimits.framingSentences.max} sentences`,
  },
);
const actionSchema = briefingParagraphSchema.refine(
  ({ segments }) =>
    BriefingSentences.isWithin({
      segments,
      ...briefingLimits.actionSentences,
    }),
  {
    message: `Expected ${briefingLimits.actionSentences.min} to ${briefingLimits.actionSentences.max} sentences`,
  },
);

/** The briefing's fixed shape: what changed, what to do about it, and what the pace says comes next. */
export const briefingWrittenTextSchema = z.object({
  opening: framingSchema,
  actions: z.array(actionSchema).max(briefingLimits.maxActions),
  closing: framingSchema,
});

/** One run of the briefing writer: the text with its links, and what the run used and cost. */
export const briefingWrittenSchema = briefingWrittenTextSchema.extend({
  unknownRefs: z
    .int()
    .nonnegative()
    .describe('How many cited refs were not in the snapshot.'),
  model: z.string(),
  tokens: briefingTokensSchema,
  costMicroUsd: z.int().nonnegative(),
  prices: briefingPricesSchema,
});

export type BriefingTokens = z.infer<typeof briefingTokensSchema>;
export type BriefingPrices = z.infer<typeof briefingPricesSchema>;
export type BriefingParagraph = z.infer<typeof briefingParagraphSchema>;
export type BriefingWritten = z.infer<typeof briefingWrittenSchema>;
export type BriefingWrittenText = z.infer<typeof briefingWrittenTextSchema>;
export type BriefingLinkedText = Pick<
  BriefingWritten,
  'opening' | 'actions' | 'closing' | 'unknownRefs'
>;
