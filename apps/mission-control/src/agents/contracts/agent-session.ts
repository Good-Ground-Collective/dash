import { z } from 'zod';

import {
  agentHeartbeatQuestionSchema,
  agentHeartbeatStatusSchema,
} from '#src/agents/contracts/agent-heartbeat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const agentActivitySchema = z.object({
  status: agentHeartbeatStatusSchema,
  summary: z
    .string()
    .nullable()
    .describe(
      'The latest summary reported. A heartbeat without one keeps the last.',
    ),
  question: agentHeartbeatQuestionSchema
    .nullable()
    .describe('The open question, from the latest heartbeat only.'),
  highestSeq: z.int().nonnegative(),
  startedAt: timestampSchema.describe('When its first heartbeat arrived.'),
  reportedAt: timestampSchema.describe(
    'When the agent emitted its highest-`seq` heartbeat, by its own clock.',
  ),
  updatedAt: timestampSchema.describe(
    'When Mission Control received its highest-`seq` heartbeat.',
  ),
});

export type AgentActivity = z.infer<typeof agentActivitySchema>;

/** One row of session state: a session's own, or one subagent's under it. Published as `agent.session.updated`. */
export const agentSessionStateSchema = agentActivitySchema.extend({
  sessionId: z.string(),
  agentId: z
    .string()
    .nullable()
    .describe('The subagent. `null` for the session itself.'),
  agentName: z.string(),
  benchId: z.string().nullable(),
  harness: z.string(),
});

export type AgentSessionState = z.infer<typeof agentSessionStateSchema>;

export const subagentSchema = agentActivitySchema.extend({
  agentId: z.string(),
});

export const agentSessionSchema = z.object({
  sessionId: z.string(),
  agentName: z.string(),
  benchId: z.string().nullable(),
  harness: z.string(),
  parent: agentActivitySchema
    .nullable()
    .describe(
      'The session’s own state. `null` while only its subagents have reported.',
    ),
  subagents: z.array(subagentSchema).describe('Oldest first.'),
});

export type AgentSession = z.infer<typeof agentSessionSchema>;

export const agentSessionsSchema = z.object({
  sessions: z
    .array(agentSessionSchema)
    .describe(
      'Sessions where anything reported in the last 24 hours, most recently updated first.',
    ),
});

export type AgentSessions = z.infer<typeof agentSessionsSchema>;
