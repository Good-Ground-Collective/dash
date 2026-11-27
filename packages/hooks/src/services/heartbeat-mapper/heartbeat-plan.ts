import type { AgentHeartbeat } from '@good-ground-collective/agentic-communication-standards';

export type HeartbeatPayload = AgentHeartbeat['payload'];

/** A heartbeat payload before the session ledger numbers it. */
export type HeartbeatDraft = Omit<HeartbeatPayload, 'seq'>;

/**
 * When the ledger writes a planned heartbeat: `always`; `liveness`, a `working` heartbeat from a
 * finished tool call that the ledger throttles; or `known-subagent`, only for a subagent whose
 * start was recorded, so Claude Code's internal agents don't appear as finished subagents.
 */
export type HeartbeatCondition = 'always' | 'liveness' | 'known-subagent';

export interface HeartbeatPlan {
  draft: HeartbeatDraft;
  condition: HeartbeatCondition;
  /** A model to remember for the session's later heartbeats. */
  sessionModel?: string | undefined;
  /** The heartbeat asks an AskUserQuestion question, which stays open until its own tool call finishes. */
  awaitsAnswer?: boolean | undefined;
}
