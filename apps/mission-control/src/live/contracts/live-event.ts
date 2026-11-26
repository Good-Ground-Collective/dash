import { z } from 'zod';

export const liveEventSchema = z.object({
  type: z.string().min(1),
  data: z.json(),
});

export type LiveEvent = z.infer<typeof liveEventSchema>;
