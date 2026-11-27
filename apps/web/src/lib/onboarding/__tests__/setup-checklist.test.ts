import { describe, expect, it } from 'vitest';
import {
  passkeySettingsPath,
  SetupChecklist,
} from '#lib/onboarding/setup-checklist.ts';

const fresh = {
  items: [
    { id: 'connectGitHub', done: false },
    { id: 'secondPasskey', done: false },
  ],
};

describe('SetupChecklist', () => {
  it('lists each item with its copy and where to do it', () => {
    const checklist = new SetupChecklist(fresh);

    expect(
      checklist.rows.map((row) => [row.title, row.action.href, row.done]),
    ).toEqual([
      ['Connect GitHub', '/setup/github', false],
      ['Add a second passkey', passkeySettingsPath, false],
    ]);
    expect(checklist.progress).toBe('0 of 2 done');
  });

  it('counts done items', () => {
    const checklist = new SetupChecklist({
      items: [
        { id: 'connectGitHub', done: true },
        { id: 'secondPasskey', done: false },
      ],
    });

    expect(checklist.doneCount).toBe(1);
    expect(checklist.progress).toBe('1 of 2 done');
    expect(checklist.visible).toBe(true);
  });

  it('leaves out items it has no words for', () => {
    const checklist = new SetupChecklist({
      items: [...fresh.items, { id: 'firstInitiative', done: false }],
    });

    expect(checklist.rows.map((row) => row.id)).toEqual([
      'connectGitHub',
      'secondPasskey',
    ]);
  });

  it('shows the card while anything is left', () => {
    expect(SetupChecklist.from(fresh)).not.toBeNull();
  });

  it('hides the card once everything is done', () => {
    expect(
      SetupChecklist.from({
        items: [
          { id: 'connectGitHub', done: true },
          { id: 'secondPasskey', done: true },
        ],
      }),
    ).toBeNull();
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
