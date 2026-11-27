import {
  agentHeartbeat,
  agentHeartbeatStatuses,
} from '@good-ground-collective/agentic-communication-standards';
import { z } from 'zod';

import { agentIdentifierSchema } from '#src/auth/contracts/service-account.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const agentHeartbeatParamsSchema = z.object({
  agentName: agentIdentifierSchema.describe(
    'The agent key the hooks report with, such as `seth-laptop`. An agent key may name only its own agent; a bench key may name any agent on its bench.',
  ),
});

/** An `agent.heartbeat` message at any 1.x version. Unknown fields are dropped and any other major is refused. */
export const agentHeartbeatMessageSchema = agentHeartbeat.schema;

export type AgentHeartbeatMessage = z.infer<typeof agentHeartbeatMessageSchema>;

export const agentHeartbeatQuestionSchema = z
  .object({
    text: z.string(),
    options: z
      .array(
        z.object({ label: z.string(), description: z.string().optional() }),
      )
      .optional(),
  })
  .describe(
    'The question as the agent sent it, read back from storage. `agent.heartbeat` in the standards package sets its limits.',
  );

export type AgentHeartbeatQuestion = z.infer<
  typeof agentHeartbeatQuestionSchema
>;

export const agentHeartbeatStatusSchema = z.enum(agentHeartbeatStatuses);

export const agentHeartbeatIssueSchema = z.object({
  path: z
    .string()
    .describe('Where in the heartbeat, dotted, such as `payload.seq`.'),
  message: z.string(),
});

const batchItemSchema = z
  .unknown()
  .transform((item) => agentHeartbeatMessageSchema.safeParse(item))
  .transform((parsed) =>
    parsed.success
      ? { valid: true as const, message: parsed.data }
      : {
          valid: false as const,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
  );

export type AgentHeartbeatBatchItem = z.output<typeof batchItemSchema>;

export const agentHeartbeatBatchSchema = z.object({
  heartbeats: z
    .array(batchItemSchema)
    .min(1)
    .max(100)
    .describe(
      'Each heartbeat is checked on its own, so one that fails validation is reported in its result without refusing the rest.',
    ),
});

export const storedAgentHeartbeatSchema = z.object({
  id: z.uuid(),
  agentName: z.string(),
  benchId: z
    .string()
    .nullable()
    .describe('The bench whose key reported it. `null` for an agent key.'),
  sessionId: z.string(),
  seq: z.int().nonnegative(),
  agentId: z
    .string()
    .nullable()
    .describe('The subagent that reported it. `null` for the session itself.'),
  harness: z.string(),
  status: agentHeartbeatStatusSchema,
  summary: z.string().nullable(),
  question: agentHeartbeatQuestionSchema.nullable(),
  emittedAt: timestampSchema,
  receivedAt: timestampSchema,
});

export type StoredAgentHeartbeat = z.infer<typeof storedAgentHeartbeatSchema>;

export const agentHeartbeatBatchResultSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.literal('created'),
      heartbeat: storedAgentHeartbeatSchema,
    })
    .describe('Stored for the first time.'),
  z
    .object({
      outcome: z.literal('duplicate'),
      heartbeat: storedAgentHeartbeatSchema,
    })
    .describe('Its `(sessionId, seq)` was already stored; this is that row.'),
  z
    .object({
      outcome: z.literal('invalid'),
      issues: z.array(agentHeartbeatIssueSchema).min(1),
    })
    .describe('Not an `agent.heartbeat` 1.x message, so nothing was stored.'),
]);

export type AgentHeartbeatBatchResult = z.infer<
  typeof agentHeartbeatBatchResultSchema
>;

export const agentHeartbeatBatchResultsSchema = z.object({
  results: z
    .array(agentHeartbeatBatchResultSchema)
    .describe('One per heartbeat sent, in the same order.'),
});

/** What storing one heartbeat did: stored it, or found its `(sessionId, seq)` already stored. */
export interface AgentHeartbeatReport {
  outcome: 'created' | 'duplicate';
  heartbeat: StoredAgentHeartbeat;
}

/** One heartbeat to store, after the caller's right to report it has been checked. */
export interface AgentHeartbeatRecord {
  agentName: string;
  benchId: string | null;
  reportedBy: string;
  message: AgentHeartbeatMessage;
}
