import { describe, expect, it } from 'vitest';
import { SampleAgentSessions } from '#lib/agents/__tests__/support/sample-agent-sessions.ts';
import type { AgentStatus } from '#lib/agents/agent-session-contracts.ts';
import { SubagentRollup } from '#lib/agents/subagent-rollup.ts';

class Many {
  static of(counts: Partial<Record<AgentStatus, number>>) {
    return Object.entries(counts).flatMap(([status, count]) =>
      Array.from({ length: count }, (_, index) =>
        SampleAgentSessions.subagent(`${status}-${index}`, {
          // SAFETY: the keys of `counts` are agent statuses.
          status: status as AgentStatus,
        }),
      ),
    );
  }
}

describe('SubagentRollup', () => {
  it('counts subagents by status, in status order', () => {
    const subagents = Many.of({ complete: 3, working: 12, question: 1 });

    expect(SubagentRollup.counts(subagents)).toEqual([
      { status: 'working', count: 12 },
      { status: 'question', count: 1 },
      { status: 'complete', count: 3 },
    ]);
    expect(SubagentRollup.phrase(subagents)).toBe(
      '12 working, 1 asking, 3 done',
    );
  });

  it('adds how many of them went silent', () => {
    const subagents = [
      ...Many.of({ working: 2 }),
      SampleAgentSessions.subagent('quiet', { liveness: 'stale' }),
      SampleAgentSessions.subagent('gone', { liveness: 'lost' }),
    ];

    expect(SubagentRollup.phrase(subagents)).toBe('4 working, 1 stale, 1 lost');
  });

  it('says nothing when there are no subagents', () => {
    expect(SubagentRollup.phrase([])).toBe('');
    expect(SubagentRollup.counts([])).toEqual([]);
  });

  it('counts the subagents in the singular and the plural', () => {
    expect(SubagentRollup.total(Many.of({ working: 1 }))).toBe('1 subagent');
    expect(SubagentRollup.total(Many.of({ working: 101 }))).toBe(
      '101 subagents',
    );
  });
});
