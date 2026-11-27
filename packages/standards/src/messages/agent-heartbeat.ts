import { z } from 'zod';

import { MessageDefinition } from '#src/envelope/message-definition.js';

const identifier = z.string().min(1).max(256);

/** The statuses a heartbeat can carry. Exactly one applies at a time; the README defines each. */
export const agentHeartbeatStatuses = [
  'working',
  'waiting',
  'question',
  'blocked',
  'complete',
  'failed',
  'error',
] as const;

/** Harnesses Dash knows about. `harness` also accepts any other lowercase dotted or dashed name. */
export const knownHarnesses = ['claude-code'] as const;

/** What an agent is doing right now, sent by a harness hook on every state change. */
export const agentHeartbeat = new MessageDefinition({
  kind: 'agent.heartbeat',
  version: '1.0',
  payload: z.object({
    sessionId: identifier.describe(
      "The harness session. A subagent carries its parent's session ID.",
    ),
    seq: z
      .int()
      .min(0)
      .describe(
        'Increases within a session for its whole life, including after a resume. Readers drop a repeated (sessionId, seq).',
      ),
    agentId: identifier
      .optional()
      .describe(
        'Set only for a subagent, so readers can roll it up under its parent session.',
      ),
    agent: z
      .object({
        type: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe('The agent type, such as a subagent name.'),
        model: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe('The model the agent runs on.'),
      })
      .optional()
      .describe('What kind of agent this is.'),
    harness: z
      .string()
      .max(64)
      .regex(/^[a-z][a-z0-9]*([.-][a-z0-9]+)*$/)
      .meta({ examples: [...knownHarnesses] })
      .describe(
        'The harness that sent the heartbeat. An open enum: a known value such as `claude-code`, or any lowercase dotted or dashed name.',
      ),
    status: z
      .enum(agentHeartbeatStatuses)
      .describe('Exactly one status; the package README defines each.'),
    summary: z
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe("The agent's last assistant message, trimmed to fit."),
    question: z
      .object({
        text: z
          .string()
          .min(1)
          .max(2000)
          .describe('The question, copied verbatim and trimmed to fit.'),
        options: z
          .array(
            z.object({
              label: z
                .string()
                .min(1)
                .max(200)
                .describe('The answer as the harness shows it.'),
              description: z
                .string()
                .min(1)
                .max(500)
                .optional()
                .describe("The harness's explanation of the answer, if any."),
            }),
          )
          .max(10)
          .optional()
          .describe('The answers offered, if the question has any.'),
      })
      .optional()
      .describe('What the agent is asking. Set when `status` is `question`.'),
    error: z
      .object({
        kind: z
          .string()
          .min(1)
          .max(100)
          .describe('A short machine-readable category, such as `api`.'),
        message: z
          .string()
          .min(1)
          .max(2000)
          .describe('What went wrong, trimmed to fit.'),
      })
      .optional()
      .describe('What failed. Set when `status` is `error`.'),
    workspace: z
      .object({
        directory: z
          .string()
          .min(1)
          .max(1024)
          .optional()
          .describe('The working directory.'),
        repository: z
          .string()
          .min(1)
          .max(256)
          .optional()
          .describe('The repository, such as `owner/name`.'),
        branch: z
          .string()
          .min(1)
          .max(256)
          .optional()
          .describe('The checked-out branch.'),
      })
      .optional()
      .describe('Where the agent is working, when the harness can tell.'),
    machine: z
      .string()
      .min(1)
      .max(256)
      .optional()
      .describe('The hostname the agent runs on.'),
    taskId: identifier
      .optional()
      .describe(
        'The task this session serves. A task can span several sessions.',
      ),
  }),
});

export type AgentHeartbeat = z.infer<typeof agentHeartbeat.schema>;
