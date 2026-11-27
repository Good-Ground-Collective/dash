import { describe, expect, it } from 'vitest';
import {
  SharedThemeLayouts,
  type ThemeLayout,
} from '#lib/theme/theme-layouts.ts';

class FakeLayouts {
  static readonly SHARED: ThemeLayout = () => ({});
  static readonly OWN: ThemeLayout = () => ({});
}

describe('SharedThemeLayouts', () => {
  it('falls back to the shared layout for a theme without its own', () => {
    const layouts = new SharedThemeLayouts({
      shared: FakeLayouts.SHARED,
      own: {},
    });

    expect(layouts.for('characters')).toBe(FakeLayouts.SHARED);
  });

  it('uses a theme’s own layout when it brings one', () => {
    const layouts = new SharedThemeLayouts({
      shared: FakeLayouts.SHARED,
      own: { characters: FakeLayouts.OWN },
    });

    expect(layouts.for('characters')).toBe(FakeLayouts.OWN);
  });
});
