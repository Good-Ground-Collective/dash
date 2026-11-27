import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectableAccount } from '#lib/api/github-account-contracts.ts';
import { OwnedConnectionRows } from '#lib/connections/owned-connection-rows.ts';
import { SampleFeed } from '#lib/github-feed/__tests__/support/sample-feed.ts';

class Sample {
  static installed(login: string): ConnectableAccount {
    return {
      account: {
        externalId: login,
        login,
        kind: 'organization',
        url: `https://github.com/${login}`,
        avatarUrl: null,
        role: 'owner',
      },
      install: {
        state: 'installed',
        installationId: '7',
        repositorySelection: 'all',
        repositoryCount: 3,
        suspended: false,
        incomplete: false,
        settingsUrl: `https://github.com/organizations/${login}/settings/installations/7`,
      },
    };
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OwnedConnectionRows.rows', () => {
  it('lists owned connections by login with where to manage each', () => {
    const rows = OwnedConnectionRows.rows({
      connections: [
        SampleFeed.connection({ id: 'n', accountLogin: 'night-shift' }),
        SampleFeed.connection({
          id: 'g',
          accountLogin: 'friend',
          kind: 'guest',
        }),
        SampleFeed.connection({ id: 'a', accountLogin: 'Acme-Labs' }),
      ],
      accounts: [Sample.installed('acme-labs')],
    });

    expect(rows.map((row) => [row.login, row.manageUrl])).toEqual([
      [
        'Acme-Labs',
        'https://github.com/organizations/acme-labs/settings/installations/7',
      ],
      ['night-shift', null],
    ]);
    expect(rows[0]?.synced).toBe('Synced 5 minutes ago');
  });

  it('ignores accounts that are only installable', () => {
    const rows = OwnedConnectionRows.rows({
      connections: [SampleFeed.connection()],
      accounts: [
        {
          ...Sample.installed('acme-labs'),
          install: { state: 'installable', installUrl: 'https://github.com/x' },
        },
      ],
    });

    expect(rows[0]?.manageUrl).toBeNull();
  });
});

describe('OwnedConnectionRows.addAccountHref', () => {
  it('uses GitHub’s picker when known, else the Connect GitHub step', () => {
    expect(OwnedConnectionRows.addAccountHref('https://github.com/pick')).toBe(
      'https://github.com/pick',
    );
    expect(OwnedConnectionRows.addAccountHref(null)).toBe('/setup/github');
  });
});
