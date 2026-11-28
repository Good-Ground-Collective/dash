export const stubReportedBy = '2f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099';

export interface StubAgentRow {
  reportedBy: string;
  sessionId: string;
  agentId: string | null;
  reporterName: string;
  benchId: string | null;
  harness: string;
  status: string;
  liveness: 'live' | 'stale' | 'lost';
  summary: string | null;
  question: {
    text: string;
    options?: { label: string; description?: string }[];
  } | null;
  error: { kind: string; message: string } | null;
  taskId: string | null;
  workspace: {
    directory?: string;
    repository?: string;
    branch?: string;
  } | null;
  machine: string | null;
  agent: { type?: string; model?: string } | null;
  highestSeq: number;
  startedAt: string;
  reportedAt: string;
  updatedAt: string;
}

export interface StubAgentSessionRow {
  reportedBy: string;
  sessionId: string;
  reporterName: string;
  benchId: string | null;
  harness: string;
  parent: Omit<
    StubAgentRow,
    | 'reportedBy'
    | 'sessionId'
    | 'agentId'
    | 'reporterName'
    | 'benchId'
    | 'harness'
  > | null;
  subagents: (Omit<
    StubAgentRow,
    'reportedBy' | 'sessionId' | 'reporterName' | 'benchId' | 'harness'
  > & { agentId: string })[];
}

/** Rows of session state as Mission Control keeps them, and the sessions they roll up into. */
export class AgentSessionRows {
  static minutesAgo(minutes: number): string {
    return new Date(Date.now() - minutes * 60_000).toISOString();
  }

  static row(props: {
    sessionId: string;
    agentId: string | null;
    status: string;
    minutesAgo: number;
    reportedBy?: string;
    reporterName?: string;
    benchId?: string | null;
    harness?: string;
    liveness?: StubAgentRow['liveness'];
    summary?: string | null;
    question?: StubAgentRow['question'];
    error?: StubAgentRow['error'];
    machine?: string | null;
    workspace?: StubAgentRow['workspace'];
    highestSeq?: number;
  }): StubAgentRow {
    const at = AgentSessionRows.minutesAgo(props.minutesAgo);
    return {
      reportedBy: props.reportedBy ?? stubReportedBy,
      sessionId: props.sessionId,
      agentId: props.agentId,
      reporterName: props.reporterName ?? 'studio-hooks',
      benchId: props.benchId === undefined ? 'studio-mini' : props.benchId,
      harness: props.harness ?? 'claude-code',
      status: props.status,
      liveness: props.liveness ?? 'live',
      summary: props.summary ?? null,
      question: props.question ?? null,
      error: props.error ?? null,
      taskId: null,
      workspace: props.workspace ?? null,
      machine: props.machine ?? null,
      agent: null,
      highestSeq: props.highestSeq ?? 1,
      startedAt: AgentSessionRows.minutesAgo(props.minutesAgo + 30),
      reportedAt: at,
      updatedAt: at,
    };
  }

  static key(row: StubAgentRow): string {
    return `${row.reportedBy}/${row.sessionId}/${row.agentId ?? ''}`;
  }

  /** Rolls rows up under their sessions, most recently updated first, as `GET /api/agents/sessions` does. */
  static sessions(rows: readonly StubAgentRow[]): StubAgentSessionRow[] {
    const sessions = new Map<string, StubAgentSessionRow>();

    for (const row of rows) {
      const key = `${row.reportedBy}/${row.sessionId}`;

      const session = sessions.get(key) ?? {
        reportedBy: row.reportedBy,
        sessionId: row.sessionId,
        reporterName: row.reporterName,
        benchId: row.benchId,
        harness: row.harness,
        parent: null,
        subagents: [],
      };

      const {
        reportedBy: _reportedBy,
        sessionId: _sessionId,
        reporterName: _reporterName,
        benchId: _benchId,
        harness: _harness,
        agentId,
        ...activity
      } = row;

      if (agentId === null) session.parent = activity;
      else session.subagents.push({ ...activity, agentId });
      sessions.set(key, session);
    }

    return [...sessions.values()].toSorted(
      (left, right) =>
        AgentSessionRows.latest(right) - AgentSessionRows.latest(left),
    );
  }

  private static latest(session: StubAgentSessionRow): number {
    return Math.max(
      ...[session.parent ?? [], session.subagents]
        .flat()
        .map((activity) => Date.parse(activity.updatedAt)),
    );
  }
}
