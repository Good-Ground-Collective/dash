import type { AgentHeartbeat } from '@good-ground-collective/agentic-communication-standards';

export type HeartbeatPayload = AgentHeartbeat['payload'];

/** A heartbeat payload before the session ledger numbers it. */
export type HeartbeatDraft = Omit<HeartbeatPayload, 'seq'>;

/**
 * When the ledger writes a planned heartbeat: `always`; `liveness`, a `working` heartbeat from a
 * finished tool call that the ledger throttles; `answer`, only while the agent is still waiting
 * on the AskUserQuestion with the plan's `toolUseId`, so a late answer can't overwrite a newer
 * question or a finished turn; or `known-subagent`, only for a subagent whose start was
 * recorded, so Claude Code's internal agents don't appear as finished subagents.
 */
export type HeartbeatCondition =
  'always' | 'liveness' | 'answer' | 'known-subagent';

export interface HeartbeatPlan {
  draft: HeartbeatDraft;
  condition: HeartbeatCondition;
  /** A model to remember for the session's later heartbeats. */
  sessionModel?: string | undefined;
  /** The heartbeat asks an AskUserQuestion question, which stays open until its own tool call finishes. */
  awaitsAnswer?: boolean | undefined;
  /** The AskUserQuestion tool call this heartbeat asks or answers. */
  toolUseId?: string | undefined;
}
