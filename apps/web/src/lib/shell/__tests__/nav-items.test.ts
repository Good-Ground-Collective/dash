import { describe, expect, it } from 'vitest';
import { NavItems } from '#lib/shell/nav-items.ts';

describe('NavItems.isCurrent', () => {
  it.each([
    ['/settings', '/settings', true],
    ['/settings/passkeys', '/settings', true],
    ['/settings-other', '/settings', false],
    ['/agents', '/settings', false],
    ['/', '/', true],
    ['/github', '/', false],
  ])('%s under %s is %s', (pathname, href, expected) => {
    expect(NavItems.isCurrent({ pathname, href })).toBe(expected);
  });
});
