import { describe, expect, it } from 'vitest';
import { SampleAgentSessions } from '#lib/agents/__tests__/support/sample-agent-sessions.ts';
import { AgentSessionLink } from '#lib/agents/agent-session-link.ts';

describe('AgentSessionLink', () => {
  it('points at a session and reads the same session back from the address', () => {
    const href = AgentSessionLink.href({
      reportedBy: SampleAgentSessions.REPORTED_BY,
      sessionId: 'session/with spaces&more',
    });
    const search = new URL(href, 'https://dash.example.test').searchParams;

    expect(href.startsWith('/agents?')).toBe(true);
    expect(AgentSessionLink.focusedKey(search)).toBe(
      `${SampleAgentSessions.REPORTED_BY}/session/with spaces&more`,
    );
  });

  it('has no focus without a session in the address', () => {
    expect(AgentSessionLink.focusedKey(new URLSearchParams(''))).toBeNull();
    expect(
      AgentSessionLink.focusedKey(new URLSearchParams('session=one')),
    ).toBeNull();
  });
});
