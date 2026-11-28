import { describe, expect, it } from 'vitest';
import { HomeDisclosure } from '#lib/home/home-disclosure.ts';

describe('HomeDisclosure', () => {
  it('starts with every item collapsed', () => {
    const disclosure = new HomeDisclosure();

    expect(disclosure.isOpen('E_passkeys')).toBe(false);
  });

  it('expands one item and collapses it again without touching the others', () => {
    const opened = new HomeDisclosure()
      .toggled('E_passkeys')
      .toggled('E_billing');

    expect(opened.isOpen('E_passkeys')).toBe(true);
    expect(opened.isOpen('E_billing')).toBe(true);

    const closed = opened.toggled('E_passkeys');
    expect(closed.isOpen('E_passkeys')).toBe(false);
    expect(closed.isOpen('E_billing')).toBe(true);
  });

  it('leaves the original untouched when toggled', () => {
    const original = new HomeDisclosure();
    original.toggled('E_passkeys');

    expect(original.isOpen('E_passkeys')).toBe(false);
  });
});
