/** An account the stub lists, before it is put on the wire. */
export interface StubAccount {
  login: string;
  kind: 'user' | 'organization';
  role: 'personal' | 'owner' | 'member' | null;
  avatar: boolean;
  install:
    | { state: 'installable' }
    | { state: 'requested' }
    | {
        state: 'installed';
        repositorySelection: 'all' | 'selected';
        repositoryCount: number | null;
        suspended?: boolean;
        incomplete?: boolean;
      };
}

const avatarHues = ['#c2410c', '#0f766e', '#4338ca', '#be123c', '#a16207'];

/** The stub's sample accounts and how Mission Control's account list would show them. */
export class GithubStubAccounts {
  static toWire(props: {
    account: StubAccount;
    index: number;
    stub: string;
    query: string;
  }) {
    const { account, stub } = props;
    const id = String(1000 + props.index);
    const install = GithubStubAccounts.installOf({ ...props, id });
    return {
      account: {
        provider: 'github',
        externalId: id,
        url: `https://github.com/${account.login}`,
        login: account.login,
        kind: account.kind,
        avatarUrl: account.avatar
          ? `${stub}/avatars/${account.login}.svg`
          : null,
        role: account.role,
      },
      install,
    };
  }
  static installOf(props: {
    account: StubAccount;
    id: string;
    stub: string;
    query: string;
  }) {
    const { account, id } = props;
    if (account.install.state === 'installable') {
      return {
        state: 'installable',
        installUrl: `${props.stub}/install?login=${account.login}&${props.query}`,
      };
    }
    if (account.install.state === 'requested') {
      return { state: 'requested', requestedAt: '2026-11-26T12:00:00.000Z' };
    }
    return {
      state: 'installed',
      installationId: id,
      repositorySelection: account.install.repositorySelection,
      repositoryCount: account.install.repositoryCount,
      suspended: account.install.suspended ?? false,
      incomplete: account.install.incomplete ?? false,
      settingsUrl: `https://github.com/settings/installations/${id}`,
      connectionId: null,
    };
  }
  static organisation(login: string): StubAccount {
    return {
      login,
      kind: 'organization',
      role: null,
      avatar: true,
      install: { state: 'installable' },
    };
  }
  static avatar(file: string): string {
    const login = file.replace(/\.svg$/u, '');
    const hue = avatarHues[login.length % avatarHues.length] ?? '#444444';
    const letter = (login.at(0) ?? '?').toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${hue}"/><text x="16" y="21" font-family="sans-serif" font-size="14" fill="#ffffff" text-anchor="middle">${letter}</text></svg>`;
  }
  static sample(): StubAccount[] {
    return [
      {
        login: 'ada',
        kind: 'user',
        role: 'personal',
        avatar: true,
        install: { state: 'installable' },
      },
      {
        login: 'acme-labs',
        kind: 'organization',
        role: 'owner',
        avatar: true,
        install: {
          state: 'installed',
          repositorySelection: 'selected',
          repositoryCount: 3,
        },
      },
      {
        login: 'night-shift',
        kind: 'organization',
        role: 'member',
        avatar: true,
        install: {
          state: 'installed',
          repositorySelection: 'all',
          repositoryCount: null,
        },
      },
      {
        login: 'old-co',
        kind: 'organization',
        role: 'owner',
        avatar: true,
        install: {
          state: 'installed',
          repositorySelection: 'selected',
          repositoryCount: null,
          suspended: true,
        },
      },
      {
        login: 'rate-limited',
        kind: 'organization',
        role: null,
        avatar: false,
        install: {
          state: 'installed',
          repositorySelection: 'selected',
          repositoryCount: null,
          incomplete: true,
        },
      },
    ];
  }
}
