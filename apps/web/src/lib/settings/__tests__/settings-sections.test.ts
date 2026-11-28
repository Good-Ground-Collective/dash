import { describe, expect, it } from 'vitest';
import {
  settingsGroups,
  settingsSection,
  SettingsSections,
} from '#lib/settings/settings-sections.ts';

describe('settingsGroups', () => {
  it('lists the groups and sections the sidebar shows', () => {
    expect(
      settingsGroups.map((group) => [
        group.label,
        group.sections.map((section) => section.label),
      ]),
    ).toEqual([
      [
        'Account',
        ['Profile and time zone', 'Appearance', 'Passkeys', 'Recovery codes'],
      ],
      ['GitHub', ['Connections', 'Watched checks']],
      ['Agents', ['Service accounts']],
      ['Briefings', ['Spend']],
    ]);
  });

  it('gives every section its own URL under /settings', () => {
    const hrefs = settingsGroups.flatMap((group) =>
      group.sections.map((section) => section.href),
    );

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.every((href) => href.startsWith('/settings/'))).toBe(true);
  });
});

describe('SettingsSections', () => {
  it('opens on the first section', () => {
    expect(SettingsSections.first().href).toBe('/settings/profile');
  });

  it('declares the Settings href the account menu links to', () => {
    expect(settingsSection.href).toBe('/settings');
  });

  it('marks a section current on a page beneath it, as the nav does', () => {
    expect(
      SettingsSections.isCurrent({
        pathname: '/settings/watched-checks/acme-labs/web',
        href: '/settings/watched-checks',
      }),
    ).toBe(true);
    expect(
      SettingsSections.isCurrent({
        pathname: '/settings/watched-checksum',
        href: '/settings/watched-checks',
      }),
    ).toBe(false);
  });

  it('recognises a section by its URL, trailing slash aside', () => {
    expect(
      SettingsSections.isCurrent({
        pathname: '/settings/passkeys/',
        href: '/settings/passkeys',
      }),
    ).toBe(true);
    expect(
      SettingsSections.isCurrent({
        pathname: '/settings/passkeys',
        href: '/settings/profile',
      }),
    ).toBe(false);
  });
});
