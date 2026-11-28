import { z } from 'zod';

import {
  agentHeartbeatAgentSchema,
  agentHeartbeatErrorSchema,
  agentHeartbeatQuestionSchema,
  agentHeartbeatStatusSchema,
  agentHeartbeatWorkspaceSchema,
  reporterNameSchema,
} from '#src/agents/contracts/agent-heartbeat.ts';
import { agentLivenessSchema } from '#src/agents/definitions/agent-liveness/agent-liveness.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const agentActivitySchema = z.object({
  status: agentHeartbeatStatusSchema,
  liveness: agentLivenessSchema,
  summary: z
    .string()
    .nullable()
    .describe(
      'The latest summary reported. A heartbeat without one keeps the last.',
    ),
  question: agentHeartbeatQuestionSchema
    .nullable()
    .describe('The open question, from the latest heartbeat only.'),
  error: agentHeartbeatErrorSchema
    .nullable()
    .describe('What failed, from the latest heartbeat only.'),
  taskId: z
    .string()
    .nullable()
    .describe(
      'The latest task reported. A heartbeat without one keeps the last.',
    ),
  workspace: agentHeartbeatWorkspaceSchema
    .nullable()
    .describe(
      'The latest workspace reported. A heartbeat without one keeps the last.',
    ),
  machine: z
    .string()
    .nullable()
    .describe(
      'The latest machine reported. A heartbeat without one keeps the last.',
    ),
  agent: agentHeartbeatAgentSchema
    .nullable()
    .describe(
      'The latest agent kind reported. A heartbeat without one keeps the last.',
    ),
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

const reportedBySchema = z
  .uuid()
  .describe(
    'The service account principal whose key reported it. Two keys sending the same `sessionId` are two sessions.',
  );

/** One row of session state: a session's own, or one subagent's under it. Published as `agent.session.updated`. */
export const agentSessionStateSchema = agentActivitySchema.extend({
  reportedBy: reportedBySchema,
  sessionId: z.string(),
  agentId: z
    .string()
    .nullable()
    .describe('The subagent. `null` for the session itself.'),
  reporterName: reporterNameSchema,
  benchId: z.string().nullable(),
  harness: z.string(),
});

export type AgentSessionState = z.infer<typeof agentSessionStateSchema>;

export const subagentSchema = agentActivitySchema.extend({
  agentId: z.string(),
});

export const agentSessionSchema = z.object({
  reportedBy: reportedBySchema,
  sessionId: z.string(),
  reporterName: reporterNameSchema,
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
