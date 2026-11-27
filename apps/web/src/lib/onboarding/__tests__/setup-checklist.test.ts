import { describe, expect, it } from 'vitest';
import { SetupChecklist } from '#lib/onboarding/setup-checklist.ts';

const fresh = { items: [{ id: 'connectGitHub', done: false }] };
const finished = { items: [{ id: 'connectGitHub', done: true }] };

describe('SetupChecklist', () => {
  it('lists each item with its copy and where to do it', () => {
    const checklist = new SetupChecklist({ report: fresh });

    expect(
      checklist.rows.map((row) => [row.title, row.action.href, row.done]),
    ).toEqual([['Connect GitHub', '/setup/github', false]]);
    expect(checklist.progress).toBe('0 of 1 done');
  });

  it('lists the first initiative, pointing to how a Project is made', () => {
    const checklist = new SetupChecklist({
      report: {
        items: [
          { id: 'connectGitHub', done: true },
          { id: 'createInitiative', done: false },
        ],
      },
    });

    expect(checklist.rows[1]).toMatchObject({
      title: 'Create your first initiative',
      action: { label: 'Create a Project' },
      done: false,
    });
    expect(checklist.rows[1]?.action.href).toMatch(
      /^https:\/\/docs\.github\.com\//u,
    );
    expect(checklist.progress).toBe('1 of 2 done');
  });

  it('counts done items', () => {
    const checklist = new SetupChecklist({ report: finished });

    expect(checklist.doneCount).toBe(1);
    expect(checklist.progress).toBe('1 of 1 done');
    expect(checklist.visible).toBe(false);
  });

  it('leaves out items it has no words for', () => {
    const checklist = new SetupChecklist({
      report: {
        items: [
          ...fresh.items,
          { id: 'secondPasskey', done: false },
          { id: 'firstInitiative', done: false },
        ],
      },
    });

    expect(checklist.rows.map((row) => row.id)).toEqual(['connectGitHub']);
  });

  it('shows the card while anything is left', () => {
    expect(SetupChecklist.from(fresh)).not.toBeNull();
  });

  it('hides the card once everything is done', () => {
    expect(SetupChecklist.from(finished)).toBeNull();
  });

  it('hides the card when Mission Control couldn’t say', () => {
    expect(SetupChecklist.from(null)).toBeNull();
  });

  it('hides the card when it knows none of the items', () => {
    expect(
      SetupChecklist.from({ items: [{ id: 'somethingNew', done: false }] }),
    ).toBeNull();
  });
});
