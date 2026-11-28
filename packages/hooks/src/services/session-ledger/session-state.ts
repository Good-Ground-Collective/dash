import { agentHeartbeatStatuses } from '@good-ground-collective/agentic-communication-standards';
import { z } from 'zod';

/** The key the session's own agent is stored under in `agents`; subagents use their agent ID. */
export const mainAgentKey = '';

/** What one session's hooks remember between processes, kept in `sessions/<sessionId>.json`. */
export const sessionStateSchema = z.object({
  nextSeq: z
    .int()
    .nonnegative()
    .default(0)
    .describe('The `seq` the next heartbeat in this session gets.'),
  lastWrittenAt: z
    .number()
    .nonnegative()
    .default(0)
    .describe('When the last heartbeat was written, in epoch milliseconds.'),
  agents: z
    .record(z.string(), z.enum(agentHeartbeatStatuses))
    .default({})
    .describe(
      'The last status sent for the main agent and each running subagent.',
    ),
  awaitingAnswer: z
    .record(z.string(), z.string())
    .default({})
    .describe(
      "Agents whose AskUserQuestion is still open, each with that tool call's ID, or an empty string when Claude Code sent none. Only that answer, or the end of the turn, moves them back to `working`.",
    ),
  model: z
    .string()
    .optional()
    .describe('The model SessionStart reported, sent on later heartbeats.'),
});

export type SessionState = z.output<typeof sessionStateSchema>;
