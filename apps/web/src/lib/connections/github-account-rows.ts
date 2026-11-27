import type { ConnectableAccount } from '#lib/api/github-account-contracts.ts';
import { Initials } from '#lib/shell/initials.ts';

/** How a row's install state reads. `incomplete` is installed, but GitHub held back the role or count. */
export type InstallBadge =
  | { kind: 'installed'; label: 'Installed' }
  | { kind: 'incomplete'; label: 'Installed · details missing' }
  | { kind: 'suspended'; label: 'Suspended' }
  | { kind: 'installable'; label: null };

/** What one account row shows. */
export interface GithubAccountRowView {
  login: string;
  avatarUrl: string | null;
  initials: string;
  rounded: boolean;
  role: string;
  badge: InstallBadge;
  /** The line under the role, such as "3 selected repositories". */
  detail: string | null;
  action: { label: 'Manage' | 'Install app'; href: string; primary: boolean };
}

/** Turns an account from Mission Control into the row Connect GitHub draws. */
export class GithubAccountRows {
  static view(entry: ConnectableAccount): GithubAccountRowView {
    const { account, install } = entry;
    const base = {
      login: account.login,
      avatarUrl: account.avatarUrl,
      initials: Initials.of(account.login.replace(/[-_.]+/gu, ' ')),
      rounded: account.kind === 'user',
      role: GithubAccountRows.role(entry),
    };
    if (install.state === 'installable') {
      return {
        ...base,
        badge: { kind: 'installable', label: null },
        detail: null,
        action: {
          label: 'Install app',
          href: install.installUrl,
          primary: true,
        },
      };
    }
    const manage = {
      label: 'Manage' as const,
      href: install.settingsUrl,
      primary: false,
    };
    if (install.suspended) {
      return {
        ...base,
        badge: { kind: 'suspended', label: 'Suspended' },
        detail: 'Dash can’t read it while it’s suspended on GitHub.',
        action: manage,
      };
    }
    if (install.incomplete) {
      return {
        ...base,
        badge: { kind: 'incomplete', label: 'Installed · details missing' },
        detail: 'Some details didn’t load. Reload to try again.',
        action: manage,
      };
    }
    return {
      ...base,
      badge: { kind: 'installed', label: 'Installed' },
      detail: GithubAccountRows.repositories(
        install.repositorySelection,
        install.repositoryCount,
      ),
      action: manage,
    };
  }

  /** "Personal account", or "Organisation · you're an owner". */
  static role(entry: ConnectableAccount): string {
    const { kind, role } = entry.account;
    if (kind === 'user') return 'Personal account';
    if (role === 'owner') return 'Organisation · you’re an owner';
    if (role === 'member') return 'Organisation · you’re a member';
    return 'Organisation';
  }

  /** "All repositories", "3 selected repositories", or "Selected repositories" when the count is hidden. */
  static repositories(
    selection: 'all' | 'selected',
    count: number | null,
  ): string {
    if (selection === 'all') {
      return count === null
        ? 'All repositories'
        : `All repositories (${count})`;
    }
    if (count === null) return 'Selected repositories';
    return `${count} selected ${count === 1 ? 'repository' : 'repositories'}`;
  }
}
