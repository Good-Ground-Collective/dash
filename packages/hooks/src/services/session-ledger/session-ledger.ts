import { randomUUID } from 'node:crypto';
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  type AgentHeartbeat,
  agentHeartbeat,
} from '@good-ground-collective/agentic-communication-standards';
import { z } from 'zod';

import { HooksConfig } from '#src/config/hooks-config.js';
import { jsonLineSchema } from '#src/contracts/json-line.js';
import { FileLock } from '#src/services/file-lock/file-lock.js';
import type { HeartbeatPlan } from '#src/services/heartbeat-mapper/heartbeat-plan.js';
import { LineFitter } from '#src/services/line-fitter/line-fitter.js';
import { OutboxTail } from '#src/services/session-ledger/outbox-tail.js';
import {
  mainAgentKey,
  type SessionState,
  sessionStateSchema,
} from '#src/services/session-ledger/session-state.js';

const fileSessionLedgerPropsSchema = z.object({
  config: z.instanceof(HooksConfig),
});

export type FileSessionLedgerProps = z.input<
  typeof fileSessionLedgerPropsSchema
>;

const sessionStateFileSchema = jsonLineSchema.pipe(sessionStateSchema);

/** Numbers each session's heartbeats and appends them to the session's outbox file. */
export interface SessionLedger {
  /** Writes the planned heartbeat if its condition holds, and returns it; `undefined` when the condition skipped it. */
  record(plan: HeartbeatPlan, now: Date): Promise<AgentHeartbeat | undefined>;
}

/**
 * A `SessionLedger` on the local disk. The parent agent and its subagents run hooks as separate
 * processes at the same moment, so the counter is read, incremented and written back, and the
 * line appended, all under one per-session lock: no two heartbeats share a `seq`, and lines land
 * in `seq` order.
 */
export class FileSessionLedger implements SessionLedger {
  private readonly config: HooksConfig;

  constructor(props: FileSessionLedgerProps) {
    const { config } = fileSessionLedgerPropsSchema.parse(props);

    this.config = config;
  }

  async record(
    plan: HeartbeatPlan,
    now: Date,
  ): Promise<AgentHeartbeat | undefined> {
    const stem = FileSessionLedger.fileStem(plan.draft.sessionId);
    const statePath = path.join(this.config.sessionsDirectory, `${stem}.json`);
    const outboxPath = path.join(this.config.outboxDirectory, `${stem}.jsonl`);

    await mkdir(this.config.sessionsDirectory, { recursive: true });
    await mkdir(this.config.outboxDirectory, { recursive: true });

    return new FileLock({ lockPath: `${statePath}.lock` }).hold(async () => {
      const loaded = await this.load(statePath, outboxPath);
      const state = FileSessionLedger.withLaunchedChild(plan, loaded);
      const effective = FileSessionLedger.withChildrenStatus(plan, state);
      if (!this.shouldWrite(effective, state, now)) {
        if (state !== loaded) {
          await FileSessionLedger.save(statePath, state);
        }
        return undefined;
      }

      const heartbeat = FileSessionLedger.numberedHeartbeat(
        effective,
        state,
        now,
      );
      await appendFile(outboxPath, `${LineFitter.fit(heartbeat)}\n`);
      await FileSessionLedger.save(
        statePath,
        FileSessionLedger.advance(effective, state, now),
      );
      return heartbeat;
    });
  }

  private shouldWrite(
    plan: HeartbeatPlan,
    state: SessionState,
    now: Date,
  ): boolean {
    const key = FileSessionLedger.agentKey(plan);

    if (plan.condition === 'known-subagent') {
      return (
        key in state.agents ||
        Object.values(state.children).some((ids) => ids.includes(key))
      );
    }
    if (plan.condition === 'liveness') {
      return this.livenessDue(key, state, now);
    }
    if (plan.condition === 'answer') {
      return state.awaitingAnswer[key] === (plan.toolUseId ?? '');
    }

    return true;
  }

  /**
   * A liveness heartbeat goes out when the agent has been quiet for the interval, or when it last
   * reported something other than `working` that a finished tool call disproves, such as an
   * approved permission prompt. It never follows a finished turn, since a late tool hook is out of
   * order there, nor an AskUserQuestion still waiting on its answer. A late non-launch tool hook
   * after `waiting` moves the agent back to `working`: Claude Code documents no resume event for
   * the main agent, so a tool call is the only sign that waiting work woke it, and that trade-off
   * is kept. A launch is the exception, see `withChildrenStatus`.
   */
  private livenessDue(key: string, state: SessionState, now: Date): boolean {
    const last = state.agents[key];
    if (FileSessionLedger.isFinished(last)) {
      return false;
    }
    if (last === 'question') {
      return !(key in state.awaitingAnswer);
    }
    if (last === 'working') {
      return (
        now.getTime() - state.lastWrittenAt >= this.config.livenessIntervalMs
      );
    }

    return true;
  }

  /** The session's counter file, or a fresh one that continues after the outbox's last `seq` if the file is missing or damaged. */
  private async load(
    statePath: string,
    outboxPath: string,
  ): Promise<SessionState> {
    const text = await readFile(statePath, 'utf8').catch(() => undefined);
    const parsed = sessionStateFileSchema.safeParse(text);
    if (parsed.success) {
      return parsed.data;
    }

    const lastSeq = await OutboxTail.lastSeq(outboxPath);
    return sessionStateSchema.parse({
      nextSeq: lastSeq === undefined ? 0 : lastSeq + 1,
    });
  }

  /** Session IDs are UUIDs, but anything else is made safe to use as a file name. */
  static fileStem(sessionId: string): string {
    return sessionId.replaceAll(/[^\w-]/g, '_');
  }

  private static agentKey(plan: HeartbeatPlan): string {
    return plan.draft.agentId ?? mainAgentKey;
  }

  /**
   * The state with the plan's background child recorded under the agent that launched it. A main
   * agent `Stop` that reports no background tasks in flight forgets the main agent's children
   * instead: Claude Code's own empty list outranks a child whose finish was never seen.
   */
  private static withLaunchedChild(
    plan: HeartbeatPlan,
    state: SessionState,
  ): SessionState {
    if (plan.reportedBackgroundTasks === 0) {
      const { [mainAgentKey]: _dropped, ...others } = state.children;
      return { ...state, children: others };
    }
    if (plan.launchedChild === undefined) {
      return state;
    }

    const key = FileSessionLedger.agentKey(plan);
    const known = state.children[key] ?? [];
    if (known.includes(plan.launchedChild)) {
      return state;
    }

    return {
      ...state,
      children: { ...state.children, [key]: [...known, plan.launchedChild] },
    };
  }

  /**
   * The plan as it should be written given the agent's background children. A turn end becomes
   * `waiting` while a child is still running. A child recorded after its launcher already
   * reported `complete`, because `PostToolUse` runs in the background and lost the race with the
   * stop, moves the launcher to `waiting`, unless the session has ended. A launch that arrives
   * while its launcher is already `waiting` on a running child keeps it `waiting` rather than
   * writing a liveness `working`.
   */
  private static withChildrenStatus(
    plan: HeartbeatPlan,
    state: SessionState,
  ): HeartbeatPlan {
    const key = FileSessionLedger.agentKey(plan);
    const hasRunningChild =
      FileSessionLedger.runningChildren(key, state).length > 0;

    if (
      plan.waitsOnRecordedChildren &&
      plan.draft.status === 'complete' &&
      hasRunningChild
    ) {
      return { ...plan, draft: { ...plan.draft, status: 'waiting' } };
    }
    if (
      plan.launchedChild !== undefined &&
      hasRunningChild &&
      (state.agents[key] === 'complete' || state.agents[key] === 'waiting') &&
      !state.ended
    ) {
      return {
        ...plan,
        draft: { ...plan.draft, status: 'waiting' },
        condition: 'always',
      };
    }

    return plan;
  }

  private static runningChildren(key: string, state: SessionState): string[] {
    return (state.children[key] ?? []).filter(
      (child) => !FileSessionLedger.isFinished(state.agents[child]),
    );
  }

  private static isFinished(
    status: SessionState['agents'][string] | undefined,
  ): boolean {
    return status === 'complete' || status === 'failed' || status === 'error';
  }

  /** The children of every agent that are still running, with finished ones forgotten. */
  private static withoutFinishedChildren(
    children: SessionState['children'],
    agents: SessionState['agents'],
  ): SessionState['children'] {
    const running = Object.entries(children).map(
      ([key, ids]) =>
        [
          key,
          ids.filter((child) => !FileSessionLedger.isFinished(agents[child])),
        ] as const,
    );

    return Object.fromEntries(running.filter(([, ids]) => ids.length > 0));
  }

  /** The heartbeat with its `seq`, envelope and the session's model, checked against the standards schema. */
  private static numberedHeartbeat(
    plan: HeartbeatPlan,
    state: SessionState,
    now: Date,
  ): AgentHeartbeat {
    const model = plan.sessionModel ?? state.model;
    const isMainAgent = plan.draft.agentId === undefined;
    const agent =
      isMainAgent && model !== undefined
        ? { ...plan.draft.agent, model }
        : plan.draft.agent;

    return agentHeartbeat.schema.parse({
      schemaVersion: agentHeartbeat.version,
      kind: agentHeartbeat.kind,
      id: randomUUID(),
      emittedAt: now.toISOString(),
      payload: { ...plan.draft, agent, seq: state.nextSeq },
    });
  }

  private static advance(
    plan: HeartbeatPlan,
    state: SessionState,
    now: Date,
  ): SessionState {
    const key = FileSessionLedger.agentKey(plan);
    const awaitingAnswer = Object.fromEntries(
      Object.entries(state.awaitingAnswer).filter(([agent]) => agent !== key),
    );

    const agents = { ...state.agents, [key]: plan.draft.status };

    return {
      nextSeq: state.nextSeq + 1,
      lastWrittenAt: now.getTime(),
      agents,
      children: FileSessionLedger.withoutFinishedChildren(
        state.children,
        agents,
      ),
      awaitingAnswer: plan.awaitsAnswer
        ? { ...awaitingAnswer, [key]: plan.toolUseId ?? '' }
        : awaitingAnswer,
      model: plan.sessionModel ?? state.model,
      ended: plan.endsSession === true,
    };
  }

  /** Writes to a temporary file and renames it, so a reader never sees half a counter file. */
  private static async save(
    statePath: string,
    state: SessionState,
  ): Promise<void> {
    const temporary = `${statePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(state));
    await rename(temporary, statePath);
  }
}
