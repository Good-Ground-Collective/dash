import { describe, expect, it } from 'vitest';
import { SampleAgentSessions } from '#lib/agents/__tests__/support/sample-agent-sessions.ts';
import { AgentBenchGroups } from '#lib/agents/agent-bench-groups.ts';

const { session, subagent } = SampleAgentSessions;

describe('AgentBenchGroups', () => {
  it('groups by bench, most recent bench first, with sessions that have no bench last', () => {
    const groups = AgentBenchGroups.of([
      session('lone', { benchId: null, parent: { minutes: 1 } }),
      session('old-studio', { benchId: 'studio', parent: { minutes: 30 } }),
      session('cloud', { benchId: 'cloud-1', parent: { minutes: 5 } }),
      session('new-studio', { benchId: 'studio', parent: { minutes: 8 } }),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      'cloud-1',
      'studio',
      'No bench',
    ]);
    expect(groups.map((group) => group.benchId)).toEqual([
      'cloud-1',
      'studio',
      null,
    ]);
  });

  it('lists the session that reported most recently first within a bench', () => {
    const [group] = AgentBenchGroups.of([
      session('old', { parent: { minutes: 30 } }),
      session('new', { parent: { minutes: 2 } }),
      session('middle', { parent: { minutes: 10 } }),
    ]);

    expect(group?.sessions.map((entry) => entry.sessionId)).toEqual([
      'new',
      'middle',
      'old',
    ]);
  });

  it('counts a subagent’s report as the session’s activity', () => {
    const [group] = AgentBenchGroups.of([
      session('quiet-parent', { parent: { minutes: 30 } }),
      session('busy-subagents', {
        parent: { minutes: 25 },
        subagents: [subagent('a', { minutes: 1 })],
      }),
    ]);

    expect(group?.sessions[0]?.sessionId).toBe('busy-subagents');
    expect(group?.lastReportedAt).toEqual(SampleAgentSessions.at(1));
  });

  it('has no groups when nothing reported', () => {
    expect(AgentBenchGroups.of([])).toEqual([]);
  });
});
