import type { ConnectableAccount } from '#lib/api/github-account-contracts.ts';
import type { GithubFeedConnection } from '#lib/api/github-feed-contracts.ts';
import { connectGithubPath } from '#lib/auth/onboarding-route.ts';
import {
  type ConnectionStatus,
  GithubFeedView,
} from '#lib/github-feed/feed-view.ts';

export interface OwnedConnectionRow extends ConnectionStatus {
  /** The installation's settings on GitHub, once the account list has loaded. */
  manageUrl: string | null;
  /** Why a personal account's install never feeds Today's focus, or null for an organisation. */
  note: string | null;
}

const personalAccountNote =
  'Initiatives come from organisation Projects. GitHub doesn’t let apps read a personal account’s Projects.';

/** Settings › Connections: the owned installs Dash reads, with how fresh each read is and where to manage it. */
export class OwnedConnectionRows {
  /** Joins the feed's connections to the account list by login, which is how GitHub names both. */
  static rows(props: {
    connections: readonly GithubFeedConnection[];
    accounts: readonly ConnectableAccount[];
  }): OwnedConnectionRow[] {
    const manage = new Map(
      props.accounts.flatMap((entry) =>
        entry.install.state === 'installed'
          ? [[entry.account.login.toLowerCase(), entry.install.settingsUrl]]
          : [],
      ),
    );
    const personal = new Set(
      props.accounts
        .filter((entry) => entry.account.kind === 'user')
        .map((entry) => entry.account.login.toLowerCase()),
    );
    return props.connections
      .filter((connection) => connection.kind === 'owned')
      .toSorted((a, b) => a.accountLogin.localeCompare(b.accountLogin))
      .map((connection) => {
        const login = connection.accountLogin.toLowerCase();
        return {
          ...GithubFeedView.statusOf(connection),
          manageUrl: manage.get(login) ?? null,
          note: personal.has(login) ? personalAccountNote : null,
        };
      });
  }

  /** GitHub's own account picker when the list has it, otherwise the Connect GitHub step. */
  static addAccountHref(addAccountUrl: string | null): string {
    return addAccountUrl ?? connectGithubPath;
  }
}
