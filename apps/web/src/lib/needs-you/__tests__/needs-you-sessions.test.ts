import { describe, expect, it } from 'vitest';
import type { NeedsYouSession } from '#lib/needs-you/needs-you-session-contracts.ts';
import { NeedsYouSessions } from '#lib/needs-you/needs-you-sessions.ts';
import { SampleNeedsYouItems } from '#lib/needs-you/__tests__/support/sample-needs-you-items.ts';

const item = SampleNeedsYouItems.open({
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  openedAt: '2026-11-27T12:00:00.000Z',
});

const session: NeedsYouSession = {
  reportedBy: item.reportedBy,
  sessionId: item.sessionId,
  reporterName: 'studio-hooks',
  benchId: 'studio',
  harness: 'claude-code',
  parent: { machine: 'studio-mini' },
};

describe('NeedsYouSessions', () => {
  it('names the harness and the machine', () => {
    expect(NeedsYouSessions.of([session]).where(item)).toBe(
      'claude-code on studio-mini',
    );
  });

  it('falls back to the bench, then to the name the hooks report as', () => {
    const noMachine = { ...session, parent: { machine: null } };
    const onlySubagents = { ...noMachine, parent: null };
    const noBench = { ...onlySubagents, benchId: null };

    expect(NeedsYouSessions.of([noMachine]).where(item)).toBe(
      'claude-code on studio',
    );
    expect(NeedsYouSessions.of([onlySubagents]).where(item)).toBe(
      'claude-code on studio',
    );
    expect(NeedsYouSessions.of([noBench]).where(item)).toBe(
      'claude-code on studio-hooks',
    );
  });

  it('says nothing for a session it does not know, including the same id from another key', () => {
    const otherKey = {
      ...session,
      reportedBy: '3f0f6d1e-0000-4c1a-9a51-2f1f6a3c0099',
    };

    expect(NeedsYouSessions.of([]).where(item)).toBeNull();
    expect(NeedsYouSessions.of([otherKey]).where(item)).toBeNull();
    expect(NeedsYouSessions.of([otherKey]).missingFor([item])).toBe(true);
    expect(NeedsYouSessions.of([session]).missingFor([item])).toBe(false);
  });
});
