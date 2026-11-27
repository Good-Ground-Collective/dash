import type { GithubAccountReads } from '#lib/api/github-accounts.ts';
import type { ConnectableAccount } from '#lib/api/github-account-contracts.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

/**
 * Where the Connect GitHub list is. `authorize` means Dash has no usable GitHub grant for the
 * person, so the only action is to authorize. `linked` lists the accounts their grant can see.
 */
export type ConnectGithubState =
  | { state: 'loading' }
  | { state: 'authorize'; authorizeUrl: string }
  | {
      state: 'linked';
      addAccountUrl: string;
      accounts: ConnectableAccount[];
    }
  | { state: 'signed-out' }
  | { state: 'failed'; error: string };

/** Loads the accounts a person can connect, for the setup step and Settings › Connections alike. */
export class ConnectGithubFlow {
  private readonly accounts: GithubAccountReads;
  private readonly returnTo: string;

  constructor(props: { accounts: GithubAccountReads; returnTo: string }) {
    this.accounts = props.accounts;
    this.returnTo = props.returnTo;
  }

  async load(): Promise<ConnectGithubState> {
    try {
      const answer = await this.accounts.list({ returnTo: this.returnTo });
      return answer.status === 'authorize'
        ? { state: 'authorize', authorizeUrl: answer.authorizeUrl }
        : {
            state: 'linked',
            addAccountUrl: answer.addAccountUrl,
            accounts: answer.accounts,
          };
    } catch (cause) {
      if (cause instanceof MissionControlError && cause.status === 401) {
        return { state: 'signed-out' };
      }
      return {
        state: 'failed',
        error:
          'Dash couldn’t load your GitHub accounts. Check that Mission Control is running, then try again.',
      };
    }
  }

  static start(): ConnectGithubState {
    return { state: 'loading' };
  }

  /** What a screen reader hears once the list has loaded. */
  static summary(state: ConnectGithubState): string {
    if (state.state === 'authorize') return 'GitHub isn’t connected yet.';
    if (state.state !== 'linked') return '';
    const installed = state.accounts.filter(
      (entry) => entry.install.state === 'installed',
    ).length;
    const total = state.accounts.length;
    return `${total} GitHub ${total === 1 ? 'account' : 'accounts'}, ${installed} installed.`;
  }
}
