export interface SettingsSection {
  label: string;
  href: string;
}

/** A list that always has a first member, so "the first section" needs no fallback. */
type NonEmpty<T> = readonly [T, ...T[]];

export interface SettingsGroup {
  label: string;
  sections: NonEmpty<SettingsSection>;
}

/** Service accounts, which the account menu also links to. */
export const serviceAccountsSection: SettingsSection = {
  label: 'Service accounts',
  href: '/settings/service-accounts',
};

export const settingsGroups: NonEmpty<SettingsGroup> = [
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
    sections: [serviceAccountsSection],
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
    return settingsGroups[0].sections[0];
  }

  /** Whether `pathname` is the section at `href`, trailing slash aside. */
  static isCurrent(props: { pathname: string; href: string }): boolean {
    return props.pathname.replace(/\/+$/u, '') === props.href;
  }
}
