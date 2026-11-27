import {
  agentHeartbeat,
  agentHeartbeatStatuses,
} from '@good-ground-collective/agentic-communication-standards';
import { z } from 'zod';

import { agentIdentifierSchema } from '#src/auth/contracts/service-account.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const agentHeartbeatParamsSchema = z.object({
  reporterName: agentIdentifierSchema.describe(
    'The name the hooks report as, such as `seth-laptop`. An agent key may name only its own agent; a bench key may name any reporter on its bench.',
  ),
});

export const reporterNameSchema = z
  .string()
  .describe(
    'The name the heartbeat was reported as, from the URL. The agent itself is `harness` and `agentId`.',
  );

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

export const agentHeartbeatErrorSchema = z
  .object({ kind: z.string(), message: z.string() })
  .describe('What failed, as the agent sent it with an `error` status.');

export type AgentHeartbeatError = z.infer<typeof agentHeartbeatErrorSchema>;

export const agentHeartbeatWorkspaceSchema = z
  .object({
    directory: z.string().optional(),
    repository: z.string().optional(),
    branch: z.string().optional(),
  })
  .describe('Where the agent is working, as it sent it.');

export type AgentHeartbeatWorkspace = z.infer<
  typeof agentHeartbeatWorkspaceSchema
>;

export const agentHeartbeatAgentSchema = z
  .object({ type: z.string().optional(), model: z.string().optional() })
  .describe('What kind of agent it is, as it sent it.');

export type AgentHeartbeatAgent = z.infer<typeof agentHeartbeatAgentSchema>;

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
  reporterName: reporterNameSchema,
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
  error: agentHeartbeatErrorSchema.nullable(),
  taskId: z.string().nullable(),
  workspace: agentHeartbeatWorkspaceSchema.nullable(),
  machine: z.string().nullable(),
  agent: agentHeartbeatAgentSchema.nullable(),
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
    .describe(
      'This key already stored its `(sessionId, seq)`; this is that row.',
    ),
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

/** What storing one heartbeat did: stored it, or found its `(sessionId, seq)` already stored by the same principal. */
export interface AgentHeartbeatReport {
  outcome: 'created' | 'duplicate';
  heartbeat: StoredAgentHeartbeat;
}

/** One heartbeat to store, after the caller's right to report it has been checked. */
export interface AgentHeartbeatRecord {
  reporterName: string;
  benchId: string | null;
  /** The principal whose key reported it. Dedupe and session state are scoped to it. */
  reportedBy: string;
  message: AgentHeartbeatMessage;
}
