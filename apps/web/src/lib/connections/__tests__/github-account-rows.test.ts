import { describe, expect, it } from 'vitest';
import type {
  ConnectableAccount,
  GithubAccount,
  InstalledState,
} from '#lib/api/github-account-contracts.ts';
import { GithubAccountRows } from '#lib/connections/github-account-rows.ts';

/** Sample accounts as Mission Control lists them. */
class Sample {
  static org(role: GithubAccount['role']): GithubAccount {
    return {
      externalId: '42',
      login: 'acme-labs',
      kind: 'organization',
      url: 'https://github.com/acme-labs',
      avatarUrl: 'https://avatars.githubusercontent.com/u/42',
      role,
    };
  }

  static installed(overrides: Partial<InstalledState>): InstalledState {
    return {
      state: 'installed',
      installationId: '7',
      repositorySelection: 'selected',
      repositoryCount: 3,
      suspended: false,
      incomplete: false,
      settingsUrl:
        'https://github.com/organizations/acme-labs/settings/installations/7',
      ...overrides,
    };
  }

  static entry(
    install: ConnectableAccount['install'],
    role: GithubAccount['role'] = 'owner',
  ): ConnectableAccount {
    return { account: Sample.org(role), install };
  }
}

describe('GithubAccountRows.view', () => {
  it('shows an installed account with its repositories and Manage', () => {
    const row = GithubAccountRows.view(Sample.entry(Sample.installed({})));

    expect(row).toMatchObject({
      login: 'acme-labs',
      initials: 'AL',
      rounded: false,
      role: 'Organisation · you’re an owner',
      badge: { kind: 'installed', label: 'Installed' },
      detail: '3 selected repositories',
      action: {
        label: 'Manage',
        href: 'https://github.com/organizations/acme-labs/settings/installations/7',
        primary: false,
      },
    });
  });

  it('labels suspended and incomplete installs on their own', () => {
    const suspended = GithubAccountRows.view(
      Sample.entry(
        Sample.installed({ suspended: true, repositoryCount: null }),
      ),
    );
    const incomplete = GithubAccountRows.view(
      Sample.entry(
        Sample.installed({ incomplete: true, repositoryCount: null }),
        null,
      ),
    );

    expect(suspended.badge).toEqual({ kind: 'suspended', label: 'Suspended' });
    expect(suspended.detail).toMatch(/suspended on GitHub/u);
    expect(incomplete.badge).toEqual({
      kind: 'incomplete',
      label: 'Installed · details missing',
    });
    expect(incomplete.role).toBe('Organisation');
    expect(incomplete.action.label).toBe('Manage');
  });

  it('offers Install app on an installable account', () => {
    const row = GithubAccountRows.view({
      account: { ...Sample.org('personal'), kind: 'user', login: 'ada' },
      install: {
        state: 'installable',
        installUrl: 'https://github.com/apps/dash/installations/new',
      },
    });

    expect(row).toMatchObject({
      rounded: true,
      role: 'Personal account',
      badge: { kind: 'installable', label: null },
      action: { label: 'Install app', primary: true },
    });
  });
});

describe('GithubAccountRows.role', () => {
  it('names a member', () => {
    expect(
      GithubAccountRows.role(Sample.entry(Sample.installed({}), 'member')),
    ).toBe('Organisation · you’re a member');
  });
});

describe('GithubAccountRows.repositories', () => {
  it('words every selection and count', () => {
    expect(GithubAccountRows.repositories('all', null)).toBe(
      'All repositories',
    );
    expect(GithubAccountRows.repositories('all', 12)).toBe(
      'All repositories (12)',
    );
    expect(GithubAccountRows.repositories('selected', 1)).toBe(
      '1 selected repository',
    );
    expect(GithubAccountRows.repositories('selected', null)).toBe(
      'Selected repositories',
    );
  });
});
