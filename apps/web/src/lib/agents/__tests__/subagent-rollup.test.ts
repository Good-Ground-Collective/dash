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

    expect(SubagentRollup.phrase(subagents)).toBe(
      '12 working, 1 asking, 3 done',
    );
  });

  it('nests silent subagents in their status so the numbers sum to the total', () => {
    const subagents = [
      ...Many.of({ working: 2, complete: 1 }),
      SampleAgentSessions.subagent('quiet', {
        status: 'working',
        liveness: 'stale',
      }),
      SampleAgentSessions.subagent('gone', {
        status: 'working',
        liveness: 'lost',
      }),
      SampleAgentSessions.subagent('late', {
        status: 'complete',
        liveness: 'stale',
      }),
    ];

    expect(SubagentRollup.phrase(subagents)).toBe(
      '4 working (1 stale, 1 lost), 2 done (1 stale)',
    );
    const topLevel = SubagentRollup.phrase(subagents)
      .replaceAll(/\([^)]*\)/gu, '')
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10));
    expect(topLevel.reduce((sum, count) => sum + count, 0)).toBe(
      subagents.length,
    );
  });

  it('says nothing when there are no subagents', () => {
    expect(SubagentRollup.phrase([])).toBe('');
  });

  it('counts the subagents in the singular and the plural', () => {
    expect(SubagentRollup.total(Many.of({ working: 1 }))).toBe('1 subagent');
    expect(SubagentRollup.total(Many.of({ working: 101 }))).toBe(
      '101 subagents',
    );
  });
});
