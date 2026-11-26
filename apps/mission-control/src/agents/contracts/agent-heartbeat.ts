import { z } from 'zod';

import { agentIdentifierSchema } from '#src/auth/contracts/service-account.ts';

export const agentHeartbeatParamsSchema = z.object({
  agentName: agentIdentifierSchema.describe(
    'The agent reporting. An agent key may name only its own agent; a bench key may name any agent on its bench.',
  ),
});

export const agentHeartbeatBodySchema = z
  .object({
    sentAt: z.iso
      .datetime({ offset: true })
      .optional()
      .describe('When the agent sent it, by its own clock.'),
  })
  .nullish()
  .describe('Optional: an empty request is a heartbeat too.');

export type AgentHeartbeatBody = z.infer<typeof agentHeartbeatBodySchema>;

export const agentHeartbeatSchema = z.object({
  id: z.uuid(),
  agentName: z.string(),
  benchId: z
    .string()
    .nullable()
    .describe('The bench whose key reported it. `null` for an agent key.'),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  receivedAt: z.iso.datetime({ offset: true }),
});

export type AgentHeartbeat = z.infer<typeof agentHeartbeatSchema>;

/** One heartbeat to store, after the caller's right to report it has been checked. */
export interface AgentHeartbeatRecord {
  agentName: string;
  benchId: string | null;
  reportedBy: string;
  sentAt: Date | null;
}
