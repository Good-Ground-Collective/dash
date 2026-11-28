import type {
  AgentActivity,
  AgentSession,
  AgentSessionState,
} from '#src/agents/contracts/agent-session.ts';
import { AgentSessionRollup } from '#src/agents/services/agent-session-rollup/agent-session-rollup.ts';
import type { ServicePrincipal } from '#src/auth/contracts/principal.ts';
import type {
  BriefingAgentDraft,
  BriefingBenchDraft,
} from '#src/briefing/contracts/briefing-snapshot.ts';
import { briefingLimits } from '#src/briefing/definitions/briefing-limits/briefing-limits.ts';
import { BriefingText } from '#src/briefing/services/briefing-text/briefing-text.ts';

/**
 * Agents and benches from the session state `GET /api/agents/sessions` reads, limited to
 * what the person's own service accounts reported. A bench's last heartbeat is the latest
 * update among the sessions its key reported, so a bench quiet for a day has none. Service
 * principals contribute a bench id and a description, never an email or a scope.
 */
export class BriefingAgentSections {
  /** The sessions the person's service accounts reported, most recently updated first. */
  static sessionsOf(props: {
    states: readonly AgentSessionState[];
    principals: readonly ServicePrincipal[];
  }): AgentSession[] {
    const owned = new Set(props.principals.map(({ id }) => id));
    return AgentSessionRollup.sessions(
      props.states.filter(({ reportedBy }) => owned.has(reportedBy)),
    );
  }

  static agents(sessions: readonly AgentSession[]): BriefingAgentDraft[] {
    return sessions
      .slice(0, briefingLimits.agents)
      .map((session) => BriefingAgentSections.agent(session));
  }

  static benches(props: {
    principals: readonly ServicePrincipal[];
    sessions: readonly AgentSession[];
  }): BriefingBenchDraft[] {
    return BriefingAgentSections.benchPrincipals(props.principals)
      .slice(0, briefingLimits.benches)
      .map((principal) => ({
        benchId: BriefingText.cap(
          principal.benchId ?? '',
          briefingLimits.nameLength,
        ),
        description: BriefingText.capped(
          principal.description,
          briefingLimits.textLength,
        ),
        lastHeartbeatAt: BriefingAgentSections.latestFor({
          principalId: principal.id,
          sessions: props.sessions,
        }),
      }));
  }

  static benchCount(principals: readonly ServicePrincipal[]): number {
    return BriefingAgentSections.benchPrincipals(principals).length;
  }

  private static benchPrincipals(
    principals: readonly ServicePrincipal[],
  ): ServicePrincipal[] {
    return principals.filter(({ benchId }) => benchId !== null);
  }

  private static latestFor(props: {
    principalId: string;
    sessions: readonly AgentSession[];
  }): string | null {
    const updates = props.sessions
      .filter(({ reportedBy }) => reportedBy === props.principalId)
      .map((session) => BriefingAgentSections.lastUpdate(session));
    return updates.length === 0
      ? null
      : new Date(Math.max(...updates)).toISOString();
  }

  private static lastUpdate(session: AgentSession): number {
    const activities = [session.parent ?? [], session.subagents].flat();
    return Math.max(
      ...activities.map(({ updatedAt }) => Date.parse(updatedAt)),
    );
  }

  private static agent(session: AgentSession): BriefingAgentDraft {
    const current = BriefingAgentSections.current(session);
    const { question, error, workspace } = current;
    return {
      agentName: BriefingText.cap(
        session.reporterName,
        briefingLimits.nameLength,
      ),
      harness: BriefingText.cap(session.harness, briefingLimits.nameLength),
      benchId: BriefingText.capped(session.benchId, briefingLimits.nameLength),
      status: current.status,
      summary: BriefingText.capped(current.summary, briefingLimits.textLength),
      question: BriefingText.capped(question?.text, briefingLimits.textLength),
      error:
        error === null
          ? null
          : {
              kind: BriefingText.cap(error.kind, briefingLimits.nameLength),
              message: BriefingText.cap(
                error.message,
                briefingLimits.textLength,
              ),
            },
      repository: BriefingText.capped(
        workspace?.repository,
        briefingLimits.nameLength,
      ),
      branch: BriefingText.capped(workspace?.branch, briefingLimits.nameLength),
      subagents: session.subagents.length,
      lastHeartbeatAt: new Date(
        BriefingAgentSections.lastUpdate(session),
      ).toISOString(),
    };
  }

  private static current(session: AgentSession): AgentActivity {
    return (
      session.parent ??
      session.subagents.reduce((latest, subagent) =>
        Date.parse(subagent.updatedAt) > Date.parse(latest.updatedAt)
          ? subagent
          : latest,
      )
    );
  }
}
