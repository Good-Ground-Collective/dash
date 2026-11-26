import { z } from 'zod';

export const heartbeatSchema = z.object({
  id: z.uuid(),
  firedAt: z.iso.datetime({ offset: true }),
  recordedAt: z.iso.datetime({ offset: true }),
});

export type Heartbeat = z.infer<typeof heartbeatSchema>;

export const heartbeatListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const heartbeatListSchema = z.object({
  heartbeats: z.array(heartbeatSchema),
});
