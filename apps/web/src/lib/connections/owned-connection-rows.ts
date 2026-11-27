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
}

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
    return props.connections
      .filter((connection) => connection.kind === 'owned')
      .toSorted((a, b) => a.accountLogin.localeCompare(b.accountLogin))
      .map((connection) => ({
        ...GithubFeedView.statusOf(connection),
        manageUrl: manage.get(connection.accountLogin.toLowerCase()) ?? null,
      }));
  }

  /** GitHub's own account picker when the list has it, otherwise the Connect GitHub step. */
  static addAccountHref(addAccountUrl: string | null): string {
    return addAccountUrl ?? connectGithubPath;
  }
}
