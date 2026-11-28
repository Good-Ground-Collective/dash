import {
  type AgentStatus,
  agentStatuses,
  type Subagent,
} from '#lib/agents/agent-session-contracts.ts';
import { AgentWording } from '#lib/agents/agent-wording.ts';

export interface SubagentCount {
  status: AgentStatus;
  count: number;
}

/** Subagents counted by status under their parent session, so a hundred of them read as one line. */
export class SubagentRollup {
  /** Statuses with at least one subagent, in the order statuses are listed. */
  static counts(subagents: readonly Subagent[]): SubagentCount[] {
    return agentStatuses
      .map((status) => ({
        status,
        count: subagents.filter((subagent) => subagent.status === status)
          .length,
      }))
      .filter((entry) => entry.count > 0);
  }

  /** “12 working, 3 done”, then how many of them went silent: “2 stale, 1 lost”. Empty when there are none. */
  static phrase(subagents: readonly Subagent[]): string {
    const counted = SubagentRollup.counts(subagents).map(
      (entry) => `${entry.count} ${AgentWording.statusLabel(entry.status)}`,
    );
    const silent = (['stale', 'lost'] as const)
      .map((liveness) => ({
        liveness,
        count: subagents.filter((subagent) => subagent.liveness === liveness)
          .length,
      }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${entry.count} ${entry.liveness}`);
    return [...counted, ...silent].join(', ');
  }

  /** “3 subagents”. */
  static total(subagents: readonly Subagent[]): string {
    const count = subagents.length;
    return `${count} subagent${count === 1 ? '' : 's'}`;
  }
}
