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
  /** A `complete` heartbeat is sent as `waiting` while the agent's recorded background children are still running. Set on every `SubagentStop`, and on a main-agent `Stop` only when Claude Code reported no `background_tasks` list; a reported list decides the status instead. */
  waitsOnRecordedChildren?: boolean | undefined;
  /** How many background tasks Claude Code reported in flight on a main-agent `Stop`; absent when it sent no list, so only the ledger's recorded children can say. An empty list means nothing is running, whatever the ledger recorded. */
  reportedBackgroundTasks?: number | undefined;
  /** The ID of a subagent this agent just launched in the background. */
  launchedChild?: string | undefined;
  /** The session's last heartbeat, after which the relay may delete its outbox once it is delivered. */
  endsSession?: boolean | undefined;
}
