import { z } from 'zod';

/** What the model returns, shaped for strict structured output: every field is required and a missing ref is `null`. */
export const briefingCompositionSchema = z.object({
  paragraphs: z.array(
    z.object({
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
    }),
  ),
});

export type BriefingComposition = z.infer<typeof briefingCompositionSchema>;
