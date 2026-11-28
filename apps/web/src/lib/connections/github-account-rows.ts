import type { ConnectableAccount } from '#lib/api/github-account-contracts.ts';
import { Initials } from '#lib/shell/initials.ts';

/** How a row's install state reads. `incomplete` is installed, but GitHub held back the role or count. */
export type InstallBadge =
  | { kind: 'installed'; label: 'Installed' }
  | { kind: 'incomplete'; label: 'Installed · details missing' }
  | { kind: 'suspended'; label: 'Suspended' }
  | { kind: 'requested'; label: 'Install requested · pending' }
  | { kind: 'installable'; label: null };

/** The link at the end of a row. A requested account has none until an owner installs. */
export interface RowAction {
  label: 'Manage' | 'Install app' | 'Request install';
  href: string;
  primary: boolean;
}

/** Plain data, so the Svelte row draws it without branching on install state. */
export interface GithubAccountRowView {
  login: string;
  avatarUrl: string | null;
  initials: string;
  rounded: boolean;
  role: string;
  badge: InstallBadge;
  /** The line under the role, such as "3 selected repositories". */
  detail: string | null;
  action: RowAction | null;
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

    if (install.state !== 'installed') {
      return { ...base, ...GithubAccountRows.awaiting(install) };
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

  /** The parts of a row for an account the app isn't installed on yet. */
  static awaiting(
    install: Exclude<ConnectableAccount['install'], { state: 'installed' }>,
  ): Pick<GithubAccountRowView, 'badge' | 'detail' | 'action'> {
    if (install.state === 'requested') {
      return {
        badge: { kind: 'requested', label: 'Install requested · pending' },
        detail: 'It shows as installed once an owner approves it on GitHub.',
        action: null,
      };
    }
    const requestable = install.state === 'requestable';
    return {
      badge: { kind: 'installable', label: null },
      detail: requestable ? 'GitHub asks its owners to install the app.' : null,
      action: {
        label: requestable ? 'Request install' : 'Install app',
        href: install.installUrl,
        primary: true,
      },
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
