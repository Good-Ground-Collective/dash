import { describe, expect, it } from 'vitest';
import { SampleAgentSessions } from '#lib/agents/__tests__/support/sample-agent-sessions.ts';
import { AgentWording } from '#lib/agents/agent-wording.ts';

const { activity } = SampleAgentSessions;

describe('AgentWording', () => {
  it('names where an agent works: repository and branch, else directory, else machine', () => {
    expect(
      AgentWording.where(
        activity({ workspace: { repository: 'dash', branch: 'main' } }),
      ),
    ).toBe('dash · main');
    expect(
      AgentWording.where(activity({ workspace: { repository: 'dash' } })),
    ).toBe('dash');
    expect(
      AgentWording.where(
        activity({ workspace: { directory: '/work/dash' }, machine: 'm' }),
      ),
    ).toBe('/work/dash');
    expect(AgentWording.where(activity({ machine: 'studio-mini' }))).toBe(
      'studio-mini',
    );
    expect(AgentWording.where(activity())).toBeNull();
    expect(AgentWording.where(null)).toBeNull();
  });

  it('flags only agents that went silent', () => {
    expect(AgentWording.livenessPill('live')).toBeNull();
    expect(AgentWording.livenessPill('stale')).toBe('Stale');
    expect(AgentWording.livenessPill('lost')).toBe('Lost');
    expect(AgentWording.livenessTone('stale')).toBe('warn');
    expect(AgentWording.livenessTone('lost')).toBe('bad');
  });

  it('words statuses for pills and for counts', () => {
    expect(AgentWording.statusLabel('complete')).toBe('done');
    expect(AgentWording.statusPill('complete')).toBe('Done');
    expect(AgentWording.statusPill('question')).toBe('Asking');
    expect(AgentWording.statusTone('failed')).toBe('bad');
  });

  it('shows what failed with its kind', () => {
    expect(
      AgentWording.errorText(
        activity({ error: { kind: 'tool', message: 'exit 1' } }),
      ),
    ).toBe('tool: exit 1');
    expect(AgentWording.errorText(activity())).toBeNull();
  });
});
