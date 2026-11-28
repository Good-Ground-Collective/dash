import { z } from 'zod';
import type { GithubAccountReads } from '#lib/api/github-accounts.ts';
import {
  type ConnectableAccount,
  type OrganizationSuggestion,
  returnToSchema,
} from '#lib/api/github-account-contracts.ts';
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
      suggestions: OrganizationSuggestion[];
    }
  | { state: 'signed-out' }
  | { state: 'failed'; error: string };

export const connectGithubFlowPropsSchema = z.object({
  accounts: z.custom<GithubAccountReads>(),
  returnTo: returnToSchema,
});

export type ConnectGithubFlowProps = z.input<
  typeof connectGithubFlowPropsSchema
>;

/** Loads the accounts a person can connect, for the setup step and Settings › Connections alike. */
export class ConnectGithubFlow {
  private readonly accounts: GithubAccountReads;
  private readonly returnTo: string;

  /** Throws when `returnTo` isn't a path in the web app, so a bad mount fails at once rather than as a load error. */
  constructor(props: ConnectGithubFlowProps) {
    const valid = connectGithubFlowPropsSchema.parse(props);
    this.accounts = valid.accounts;
    this.returnTo = valid.returnTo;
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
            suggestions: answer.suggestions,
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
