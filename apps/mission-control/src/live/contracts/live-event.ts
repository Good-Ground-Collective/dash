import { z } from 'zod';

export const liveEventSchema = z.object({
  type: z
    .string()
    .regex(/^[\w.:-]+$/u)
    .describe('An SSE event name: no whitespace, so it cannot break the frame'),
  data: z.json(),
});

export type LiveEvent = z.infer<typeof liveEventSchema>;
