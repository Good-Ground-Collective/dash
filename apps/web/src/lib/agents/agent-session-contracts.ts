import { z } from 'zod';

const timestampSchema = z.iso.datetime({ offset: true }).pipe(z.coerce.date());

export const agentStatuses = [
  'working',
  'waiting',
  'question',
  'blocked',
  'complete',
  'failed',
  'error',
] as const;

export const agentStatusSchema = z.enum(agentStatuses);

export const agentLivenessSchema = z
  .enum(['live', 'stale', 'lost'])
  .describe(
    'Whether a working agent is still reporting. `stale` and `lost` mean it went silent while working; its next heartbeat makes it `live` again.',
  );

const agentQuestionSchema = z
  .object({
    text: z.string(),
    options: z
      .array(
        z.object({ label: z.string(), description: z.string().optional() }),
      )
      .optional(),
  })
  .describe(
    'The question exactly as the agent sent it, so it is untrusted text to show as plain text.',
  );

export const agentActivitySchema = z.object({
  status: agentStatusSchema,
  liveness: agentLivenessSchema,
  summary: z
    .string()
    .nullable()
    .describe('The latest summary reported, as plain text.'),
  question: agentQuestionSchema
    .nullable()
    .describe('The open question, from the latest heartbeat only.'),
  error: z
    .object({ kind: z.string(), message: z.string() })
    .nullable()
    .describe('What failed, from the latest heartbeat only.'),
  taskId: z.string().nullable(),
  workspace: z
    .object({
      directory: z.string().optional(),
      repository: z.string().optional(),
      branch: z.string().optional(),
    })
    .nullable()
    .describe('Where the agent is working, as it sent it.'),
  machine: z.string().nullable(),
  agent: z
    .object({ type: z.string().optional(), model: z.string().optional() })
    .nullable(),
  livenessChangedAt: timestampSchema.describe(
    'When `liveness` last changed. Of two rows with the same `highestSeq`, the later one is newer.',
  ),
  highestSeq: z.int().nonnegative(),
  startedAt: timestampSchema.describe('When its first heartbeat arrived.'),
  reportedAt: timestampSchema.describe(
    'When the agent emitted its latest heartbeat, by its own clock.',
  ),
  updatedAt: timestampSchema.describe(
    'When Mission Control received its latest heartbeat.',
  ),
});

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
  reporterName: z.string(),
  benchId: z.string().nullable(),
  harness: z.string(),
});

export const subagentSchema = agentActivitySchema.extend({
  agentId: z.string(),
});

export const agentSessionSchema = z.object({
  reportedBy: reportedBySchema,
  sessionId: z.string(),
  reporterName: z.string().describe('The name the hooks report as.'),
  benchId: z.string().nullable(),
  harness: z.string(),
  parent: agentActivitySchema
    .nullable()
    .describe(
      'The session’s own state. `null` while only its subagents have reported.',
    ),
  subagents: z.array(subagentSchema).describe('Oldest first.'),
});

/** `GET /api/agents/sessions` on Mission Control. */
export const agentSessionsSchema = z.object({
  sessions: z
    .array(agentSessionSchema)
    .describe(
      'Sessions where anything reported in the last 24 hours, most recently updated first.',
    ),
});

export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentLiveness = z.infer<typeof agentLivenessSchema>;
export type AgentActivity = z.infer<typeof agentActivitySchema>;
export type AgentSessionState = z.infer<typeof agentSessionStateSchema>;
export type Subagent = z.infer<typeof subagentSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
