import { describe, expect, it } from 'vitest';
import { EpicDisclosure } from '#lib/home/epic-disclosure.ts';

describe('EpicDisclosure', () => {
  it('starts with every epic collapsed', () => {
    const disclosure = new EpicDisclosure();

    expect(disclosure.isOpen('E_passkeys')).toBe(false);
  });

  it('expands one epic and collapses it again without touching the others', () => {
    const opened = new EpicDisclosure()
      .toggled('E_passkeys')
      .toggled('E_billing');

    expect(opened.isOpen('E_passkeys')).toBe(true);
    expect(opened.isOpen('E_billing')).toBe(true);

    const closed = opened.toggled('E_passkeys');
    expect(closed.isOpen('E_passkeys')).toBe(false);
    expect(closed.isOpen('E_billing')).toBe(true);
  });

  it('leaves the original untouched when toggled', () => {
    const original = new EpicDisclosure();
    original.toggled('E_passkeys');

    expect(original.isOpen('E_passkeys')).toBe(false);
  });
});
