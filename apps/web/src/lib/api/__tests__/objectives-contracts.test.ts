import { describe, expect, it } from 'vitest';
import {
  objectivesSchema,
  overlayChangesSchema,
} from '#lib/api/objectives-contracts.ts';

const epic = {
  id: 'I_10',
  connectionId: '10000000-0000-4000-8000-000000000001',
  title: 'Sign-up flow',
  url: 'https://github.com/acme/app/issues/10',
  status: 'active',
  priority: { value: 'P1', source: 'tracker' },
  dueDate: { value: '2026-12-15', source: 'tracker' },
  progress: { source: 'tracker', done: 1, total: 3 },
  lastActivityAt: '2026-11-25T09:00:00.000Z',
  latestUpdate: {
    kind: 'commented',
    occurredAt: '2026-11-25T08:00:00.000Z',
    actor: 'grace',
    url: 'https://github.com/acme/app/issues/12#comment',
    ticket: { id: 'I_12', title: 'Email check' },
  },
  nextTicket: {
    id: 'I_13',
    title: 'Password rules',
    url: 'https://github.com/acme/app/issues/13',
    priority: null,
  },
  hints: [],
  dueAfterInitiative: false,
};

describe('objectivesSchema', () => {
  it('reads Mission Control’s answer, with timestamps as dates', () => {
    const objectives = objectivesSchema.parse({
      connections: [
        {
          id: epic.connectionId,
          accountLogin: 'acme',
          lastSyncedAt: '2026-11-26T12:00:00.000Z',
          lastError: null,
          truncated: false,
        },
      ],
      initiatives: [
        {
          ...epic,
          id: 'PVT_1',
          priority: { value: 'P2', source: 'dash' },
          progress: { source: 'manual', percent: 40 },
          hints: ['no_recent_activity'],
          epics: [epic],
        },
      ],
    });

    expect(objectives.initiatives[0]?.epics[0]?.lastActivityAt).toEqual(
      new Date('2026-11-25T09:00:00.000Z'),
    );
    expect(objectives.initiatives[0]?.progress).toEqual({
      source: 'manual',
      percent: 40,
    });
  });
});

describe('overlayChangesSchema', () => {
  it('accepts a partial change and refuses fields Dash doesn’t keep', () => {
    expect(overlayChangesSchema.safeParse({ parked: true }).success).toBe(true);
    expect(overlayChangesSchema.safeParse({ status: 'done' }).success).toBe(
      false,
    );
  });
});
