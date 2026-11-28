import { z } from 'zod';

import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';

const compositionParagraphSchema = z.object({
  segments: z.array(
    z.object({
      text: z.string(),
      ref: z
        .string()
        .nullable()
        .describe(
          'The ref of the snapshot item this text is about, or null when it is about none.',
        ),
    }),
  ),
});

/** What the model returns before Dash trims it to the shape: any number of actions and any length of text. */
export const briefingRawCompositionSchema = z.object({
  opening: compositionParagraphSchema.describe(
    '2 to 3 sentences on everything relevant since the last briefing, the most substantial change first.',
  ),
  actions: z
    .array(compositionParagraphSchema)
    .describe('The actions the owner should take, one sentence each.'),
  closing: compositionParagraphSchema.describe(
    '2 to 3 forward-looking sentences based on the pace seen in the snapshot.',
  ),
});

/** What the model is asked for, shaped for strict structured output: every field is required, a missing ref is `null`, and there are at most three actions. */
export const briefingCompositionSchema = briefingRawCompositionSchema.extend({
  actions: z
    .array(compositionParagraphSchema)
    .max(briefingLimits.maxActions)
    .describe(
      'Up to three actions the owner should take, one sentence each. Empty when nothing needs them.',
    ),
});

export type BriefingComposition = z.infer<typeof briefingRawCompositionSchema>;
