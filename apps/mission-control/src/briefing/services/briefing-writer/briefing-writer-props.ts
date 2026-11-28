import OpenAI from 'openai';
import { z } from 'zod';

import { briefingPricesSchema } from '#src/briefing/contracts/briefing-written.ts';

export const openAiBriefingWriterPropsSchema = z.object({
  client: z.custom<OpenAI>((value) => value instanceof OpenAI),
  settings: z.object({
    model: z.string().min(1),
    prices: briefingPricesSchema,
    maxOutputTokens: z.int().positive(),
  }),
});

export type OpenAiBriefingWriterProps = z.input<
  typeof openAiBriefingWriterPropsSchema
>;
