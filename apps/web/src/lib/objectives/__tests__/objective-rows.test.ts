import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectiveRows } from '#lib/objectives/objective-rows.ts';
import { SampleObjectives } from './support/sample-objectives.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ObjectiveRows.of', () => {
  it('shows the tracker’s priority, due date and progress, linking to GitHub', () => {
    expect(ObjectiveRows.of(SampleObjectives.epic())).toEqual({
      id: 'E_1',
      title: 'Sign-in with passkeys',
      href: 'https://github.com/acme-labs/api/issues/10',
      status: 'active',
      priority: { label: 'P1', fromDash: false },
      due: { label: 'Due 12 Dec', fromDash: false },
      progress: { label: '3 of 5 done', percent: 60, fromDash: false },
      update: null,
      next: null,
      tasks: { items: [], hiddenCount: 0 },
      hints: [],
      dueAfterInitiative: false,
    });
  });

  it('marks values Dash set and adds the year to a date in another year', () => {
    const row = ObjectiveRows.of(
      SampleObjectives.epic({
        priority: { value: 'P3', source: 'dash' },
        dueDate: { value: '2027-01-05', source: 'dash' },
      }),
    );

    expect(row.priority).toEqual({ label: 'P3', fromDash: true });
    expect(row.due).toEqual({ label: 'Due 5 Jan 2027', fromDash: true });
  });
});

describe('ObjectiveRows.of flags and links', () => {
  it('flags an epic due after its initiative and names the hints', () => {
    const row = ObjectiveRows.of(
      SampleObjectives.epic({
        dueAfterInitiative: true,
        hints: ['all_tickets_closed', 'no_recent_activity'],
      }),
    );

    expect(row.dueAfterInitiative).toBe(true);
    expect(row.hints).toEqual(['All tickets closed', 'No activity in 14 days']);
  });

  it('never flags an initiative as due after itself', () => {
    const row = ObjectiveRows.of(
      SampleObjectives.initiative({ hints: ['all_epics_closed'] }),
    );

    expect(row.dueAfterInitiative).toBe(false);
    expect(row.hints).toEqual(['All epics closed']);
    expect(row.priority).toBeNull();
    expect(row.due).toBeNull();
  });

  it('links the next ticket', () => {
    const row = ObjectiveRows.of(
      SampleObjectives.epic({
        nextTicket: {
          id: 'I_3',
          title: 'Store credentials',
          url: 'https://github.com/acme-labs/api/issues/13',
          priority: 'P2',
        },
      }),
    );

    expect(row.next).toEqual({
      title: 'Store credentials',
      href: 'https://github.com/acme-labs/api/issues/13',
    });
  });
});

describe('ObjectiveRows tasks', () => {
  const epic = SampleObjectives.epic({
    tasks: {
      total: 4,
      urls: [],
      items: [
        {
          id: 'I_1',
          title: 'Rate-limit sign-in attempts',
          url: 'https://github.com/acme-labs/api/issues/11',
          state: 'open',
          assignees: ['grace', 'ada'],
        },
        {
          id: 'I_2',
          title: 'Hash recovery codes',
          url: 'https://github.com/acme-labs/api/issues/12',
          state: 'closed',
          assignees: [],
        },
      ],
    },
  });

  it('shows each task with its state, assignees and link', () => {
    expect(ObjectiveRows.of(epic).tasks.items).toEqual([
      {
        id: 'I_1',
        title: 'Rate-limit sign-in attempts',
        href: 'https://github.com/acme-labs/api/issues/11',
        done: false,
        stateLabel: 'To do',
        assignee: 'grace, ada',
      },
      {
        id: 'I_2',
        title: 'Hash recovery codes',
        href: 'https://github.com/acme-labs/api/issues/12',
        done: true,
        stateLabel: 'Done',
        assignee: null,
      },
    ]);
  });

  it('counts the tasks left on GitHub when the list is capped', () => {
    expect(ObjectiveRows.of(epic).tasks.hiddenCount).toBe(2);
  });

  it('gives an initiative no tasks', () => {
    expect(ObjectiveRows.of(SampleObjectives.initiative()).tasks).toEqual({
      items: [],
      hiddenCount: 0,
    });
  });
});

describe('ObjectiveRows.progress', () => {
  it('reads a hand-set percent as Dash’s', () => {
    expect(ObjectiveRows.progress({ source: 'manual', percent: 40 })).toEqual({
      label: '40%',
      percent: 40,
      fromDash: true,
    });
  });

  it('has nothing to show without linked work or a percent', () => {
    expect(ObjectiveRows.progress({ source: 'none' })).toBeNull();
  });

  it('reads an empty tracker count as 0%', () => {
    expect(
      ObjectiveRows.progress({ source: 'tracker', done: 0, total: 0 }),
    ).toMatchObject({ label: '0 of 0 done', percent: 0 });
  });
});

describe('ObjectiveRows.update', () => {
  it('says who did what to which ticket, and when', () => {
    expect(
      ObjectiveRows.update({
        kind: 'pull_request_merged',
        occurredAt: new Date('2026-11-27T10:00:00Z'),
        actor: 'grace',
        url: 'https://github.com/acme-labs/api/pull/50',
        ticket: { id: 'I_2', title: 'Hash recovery codes' },
      }),
    ).toEqual({
      text: 'grace merged a pull request for “Hash recovery codes” · 2 hours ago',
      href: 'https://github.com/acme-labs/api/pull/50',
    });
  });

  it('falls back to “Someone” without an actor', () => {
    const update = ObjectiveRows.update({
      kind: 'commented',
      occurredAt: new Date('2026-11-27T11:59:30Z'),
      actor: null,
      url: 'https://github.com/acme-labs/api/issues/2#c1',
      ticket: { id: 'I_2', title: 'Hash recovery codes' },
    });

    expect(update?.text).toBe(
      'Someone commented on “Hash recovery codes” · just now',
    );
  });
});
