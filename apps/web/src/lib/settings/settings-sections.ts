export interface SettingsSection {
  label: string;
  href: string;
}

export interface SettingsGroup {
  label: string;
  sections: readonly SettingsSection[];
}

export const settingsGroups: readonly SettingsGroup[] = [
  {
    label: 'Account',
    sections: [
      { label: 'Profile and time zone', href: '/settings/profile' },
      { label: 'Appearance', href: '/settings/appearance' },
      { label: 'Passkeys', href: '/settings/passkeys' },
      { label: 'Recovery codes', href: '/settings/recovery-codes' },
    ],
  },
  {
    label: 'GitHub',
    sections: [{ label: 'Connections', href: '/settings/github' }],
  },
  {
    label: 'Agents',
    sections: [
      { label: 'Service accounts', href: '/settings/service-accounts' },
    ],
  },
  {
    label: 'Briefings',
    sections: [{ label: 'Spend', href: '/settings/briefings' }],
  },
];

/** Where the sections sit and which one a URL falls in. */
export class SettingsSections {
  /** The section `/settings` opens on. */
  static first(): SettingsSection {
    const [group] = settingsGroups;
    const [section] = group?.sections ?? [];
    if (section === undefined) throw new Error('Settings has no sections');
    return section;
  }

  /** Whether `pathname` is the section at `href`, trailing slash aside. */
  static isCurrent(props: { pathname: string; href: string }): boolean {
    return props.pathname.replace(/\/+$/u, '') === props.href;
  }
}
