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

describe('NavItems.mostSpecific', () => {
  const hrefs = ['/settings', '/settings/service-accounts'];

  it.each([
    ['/settings/service-accounts', '/settings/service-accounts'],
    ['/settings/service-accounts/new', '/settings/service-accounts'],
    ['/settings/passkeys', '/settings'],
    ['/settings', '/settings'],
    ['/agents', undefined],
  ])('%s picks %s', (pathname, expected) => {
    expect(NavItems.mostSpecific({ pathname, hrefs })).toBe(expected);
  });
});
