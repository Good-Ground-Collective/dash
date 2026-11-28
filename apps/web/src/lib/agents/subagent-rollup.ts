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

  /** “12 working, 3 done”, with silent ones nested in their status: “4 working (1 stale), 2 done”. Empty when there are none. */
  static phrase(subagents: readonly Subagent[]): string {
    return agentStatuses
      .map((status) => {
        const inStatus = subagents.filter(
          (subagent) => subagent.status === status,
        );
        const silent = (['stale', 'lost'] as const)
          .map((liveness) => ({
            liveness,
            count: inStatus.filter((subagent) => subagent.liveness === liveness)
              .length,
          }))
          .filter((entry) => entry.count > 0)
          .map((entry) => `${entry.count} ${entry.liveness}`);
        const label = `${inStatus.length} ${AgentWording.statusLabel(status)}`;
        return {
          count: inStatus.length,
          text: silent.length > 0 ? `${label} (${silent.join(', ')})` : label,
        };
      })
      .filter((entry) => entry.count > 0)
      .map((entry) => entry.text)
      .join(', ');
  }

  /** “3 subagents”. */
  static total(subagents: readonly Subagent[]): string {
    const count = subagents.length;
    return `${count} subagent${count === 1 ? '' : 's'}`;
  }
}
