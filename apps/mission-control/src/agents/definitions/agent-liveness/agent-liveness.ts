import { z } from 'zod';

export const agentLivenesses = ['live', 'stale', 'lost'] as const;

export const agentLivenessSchema = z
  .enum(agentLivenesses)
  .describe(
    'Whether a working agent is still reporting. `stale` and `lost` mean it went silent while working; its next heartbeat makes it `live` again.',
  );

export type AgentLiveness = z.infer<typeof agentLivenessSchema>;

export const agentStaleAfterMinutes = 10;
export const agentLostAfterMinutes = 30;
