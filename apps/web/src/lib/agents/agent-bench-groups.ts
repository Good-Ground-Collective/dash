import type { AgentSession } from '#lib/agents/agent-session-contracts.ts';
import { AgentSessionActivity } from '#lib/agents/agent-session-activity.ts';

/** The sessions on one bench. `benchId` is `null` for sessions reported by an agent key, which belongs to no bench. */
export interface AgentBenchGroup {
  benchId: string | null;
  label: string;
  lastReportedAt: Date;
  sessions: AgentSession[];
}

/** Sessions grouped by the bench they ran on, as the Agents page lists them. */
export class AgentBenchGroups {
  static readonly NO_BENCH_LABEL = 'No bench';

  /** Benches with the most recent activity first, and “No bench” last. Within a bench, the session that reported most recently comes first. */
  static of(sessions: readonly AgentSession[]): AgentBenchGroup[] {
    const byBench = Map.groupBy(sessions, (session) => session.benchId);
    const groups = [...byBench].map(([benchId, members]) => {
      const times = members.map((member) =>
        AgentSessionActivity.lastReportedAt(member).getTime(),
      );
      return {
        benchId,
        label: benchId ?? AgentBenchGroups.NO_BENCH_LABEL,
        lastReportedAt: new Date(Math.max(...times)),
        sessions: members.toSorted(AgentBenchGroups.mostRecentFirst),
      };
    });
    return groups.toSorted(AgentBenchGroups.benchOrder);
  }

  private static mostRecentFirst(left: AgentSession, right: AgentSession) {
    return (
      AgentSessionActivity.lastReportedAt(right).getTime() -
        AgentSessionActivity.lastReportedAt(left).getTime() ||
      left.sessionId.localeCompare(right.sessionId)
    );
  }

  private static benchOrder(left: AgentBenchGroup, right: AgentBenchGroup) {
    if (left.benchId === null) return 1;
    if (right.benchId === null) return -1;
    return (
      right.lastReportedAt.getTime() - left.lastReportedAt.getTime() ||
      left.label.localeCompare(right.label)
    );
  }
}
