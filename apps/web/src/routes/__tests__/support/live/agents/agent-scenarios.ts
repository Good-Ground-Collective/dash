import { AgentSessionRows, type StubAgentRow } from './agent-session-rows.ts';

const orchestrator = 'session-outbox-1';

/** What the Agents stub can hold, and the changes a test can send, by name. */
export class AgentScenarios {
  static readonly SCENARIOS = ['empty', 'several'] as const;

  static readonly CHANGES = [
    'subagent-done',
    'subagent-new',
    'session-stale',
    'session-lost',
    'session-live-again',
    'new-session',
  ] as const;

  /** The row a named change sends as `agent.session.updated`. */
  static change(name: (typeof AgentScenarios.CHANGES)[number]): StubAgentRow {
    const { row } = AgentSessionRows;
    switch (name) {
      case 'subagent-done':
        return row({
          sessionId: orchestrator,
          agentId: 'hooks-builder',
          status: 'complete',
          minutesAgo: 0,
          summary: 'hooks-builder is complete',
          highestSeq: 2,
        });
      case 'subagent-new':
        return row({
          sessionId: orchestrator,
          agentId: 'late-joiner',
          status: 'working',
          minutesAgo: 0,
          summary: 'late-joiner is working',
        });
      case 'session-stale':
        return AgentScenarios.cloudLive({ liveness: 'stale', minutesAgo: 11 });
      case 'session-lost':
        return AgentScenarios.cloudLive({ liveness: 'lost', minutesAgo: 31 });
      case 'session-live-again':
        return AgentScenarios.cloudLive({ liveness: 'live', minutesAgo: 0 });
      case 'new-session':
        return row({
          sessionId: 'session-new-1',
          agentId: null,
          status: 'working',
          minutesAgo: 0,
          reporterName: 'lab-bot',
          benchId: 'lab-pi',
          harness: 'claude-code',
          summary: 'Just started',
        });
    }
  }

  /** Three benches and a session with none: live, stale and lost sessions, one with a mixed set of subagents, one asking a question, and markup in the text agents sent. */
  static several(): StubAgentRow[] {
    return [
      ...AgentScenarios.studio(),
      ...AgentScenarios.cloud(),
      ...AgentScenarios.elsewhere(),
    ];
  }

  private static studio(): StubAgentRow[] {
    return [
      AgentSessionRows.row({
        sessionId: orchestrator,
        agentId: null,
        status: 'working',
        minutesAgo: 1,
        summary: 'Splitting the outbox relay into stages',
        machine: 'studio-mini',
        workspace: { repository: 'dash', branch: 'feat/outbox-relay' },
      }),
      ...AgentScenarios.subagents(),
    ];
  }

  private static cloud(): StubAgentRow[] {
    const { row } = AgentSessionRows;
    return [
      row({
        sessionId: 'session-cloud-live',
        agentId: null,
        status: 'working',
        minutesAgo: 3,
        reporterName: 'cloud-1',
        benchId: 'cloud-1',
        harness: 'codex',
        summary: 'Running the nightly triage',
        workspace: { repository: 'agentic-standards', branch: 'main' },
      }),
      row({
        sessionId: 'session-cloud-stale',
        agentId: null,
        status: 'working',
        minutesAgo: 14,
        liveness: 'stale',
        reporterName: 'cloud-1',
        benchId: 'cloud-1',
        harness: 'codex',
        summary: 'Waiting on the package index',
      }),
      row({
        sessionId: 'session-cloud-lost',
        agentId: null,
        status: 'working',
        minutesAgo: 41,
        liveness: 'lost',
        reporterName: 'cloud-1',
        benchId: 'cloud-1',
        harness: 'codex',
        summary: 'Reindexing the archive',
      }),
    ];
  }

  private static elsewhere(): StubAgentRow[] {
    const { row } = AgentSessionRows;
    return [
      row({
        sessionId: 'session-ask-1',
        agentId: null,
        status: 'question',
        minutesAgo: 6,
        reporterName: 'release-bot',
        benchId: 'lab-pi',
        summary: 'Preparing the release notes',
        question: {
          text: 'Ship the standards package as 1.1.0 or 2.0.0?',
          options: [{ label: '1.1.0' }, { label: '2.0.0' }],
        },
      }),
      row({
        sessionId: 'session-markup-1',
        agentId: null,
        status: 'complete',
        minutesAgo: 20,
        reporterName: '<b>laptop</b>',
        benchId: null,
        summary: '<img src=x onerror=alert(1)> Finished the migration',
      }),
    ];
  }

  private static subagents(): StubAgentRow[] {
    const { row } = AgentSessionRows;
    const sub = (agentId: string, status: string, minutesAgo: number) =>
      row({
        sessionId: orchestrator,
        agentId,
        status,
        minutesAgo,
        summary: `${agentId} is ${status}`,
      });
    return [
      sub('hooks-builder', 'working', 2),
      sub('relay-tester', 'working', 2),
      sub('docs-writer', 'working', 4),
      row({
        sessionId: orchestrator,
        agentId: 'schema-checker',
        status: 'question',
        minutesAgo: 5,
        summary: 'Checking the heartbeat schema',
        question: { text: 'Which outbox path should be the default?' },
      }),
      sub('lint-fixer', 'complete', 7),
      sub('type-fixer', 'complete', 8),
      row({
        sessionId: orchestrator,
        agentId: 'stuck-reader',
        status: 'working',
        minutesAgo: 12,
        liveness: 'stale',
        summary: 'Reading the old relay',
      }),
    ];
  }

  private static cloudLive(props: {
    liveness: StubAgentRow['liveness'];
    minutesAgo: number;
  }): StubAgentRow {
    return AgentSessionRows.row({
      sessionId: 'session-cloud-live',
      agentId: null,
      status: 'working',
      reporterName: 'cloud-1',
      benchId: 'cloud-1',
      harness: 'codex',
      summary: 'Running the nightly triage',
      highestSeq: 1,
      ...props,
    });
  }
}
