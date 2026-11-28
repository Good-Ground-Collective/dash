import { AgentSessionActivity } from '#lib/agents/agent-session-activity.ts';

/** A link to one session's row on the Agents page. */
export class AgentSessionLink {
  static readonly PATH = '/agents';

  static href(props: { reportedBy: string; sessionId: string }): string {
    const query = new URLSearchParams({
      reportedBy: props.reportedBy,
      session: props.sessionId,
    });
    return `${AgentSessionLink.PATH}?${query.toString()}`;
  }

  /** The key of the session the link points at, or `null` when the page was opened without one. */
  static focusedKey(search: Pick<URLSearchParams, 'get'>): string | null {
    const reportedBy = search.get('reportedBy');
    const sessionId = search.get('session');
    if (reportedBy === null || sessionId === null) return null;
    return AgentSessionActivity.key({ reportedBy, sessionId });
  }
}
