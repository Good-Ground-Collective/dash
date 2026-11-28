import {
  type AgentStatus,
  agentStatuses,
  type Subagent,
} from '#lib/agents/agent-session-contracts.ts';
import { AgentWording } from '#lib/agents/agent-wording.ts';

const silentLiveness = ['stale', 'lost'] as const;

/** Subagents counted by status under their parent session, so a hundred of them read as one line. */
export class SubagentRollup {
  /** “12 working, 3 done”, with silent ones nested in their status: “4 working (1 stale), 2 done”. Empty when there are none. */
  static phrase(subagents: readonly Subagent[]): string {
    return agentStatuses
      .map((status) =>
        SubagentRollup.statusText(
          status,
          subagents.filter((subagent) => subagent.status === status),
        ),
      )
      .filter((text) => text !== '')
      .join(', ');
  }

  static total(subagents: readonly Subagent[]): string {
    const count = subagents.length;
    return `${count} subagent${count === 1 ? '' : 's'}`;
  }

  private static statusText(
    status: AgentStatus,
    inStatus: readonly Subagent[],
  ): string {
    if (inStatus.length === 0) return '';
    const silent = silentLiveness
      .map((liveness) => ({
        liveness,
        count: inStatus.filter((subagent) => subagent.liveness === liveness)
          .length,
      }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${entry.count} ${entry.liveness}`);
    const label = `${inStatus.length} ${AgentWording.statusLabel(status)}`;
    return silent.length > 0 ? `${label} (${silent.join(', ')})` : label;
  }
}
