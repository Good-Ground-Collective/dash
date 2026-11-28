import { z } from 'zod';
import type { GithubAccountReads } from '#lib/api/github-accounts.ts';
import {
  type ConnectableAccount,
  organizationLoginSchema,
  returnToSchema,
} from '#lib/api/github-account-contracts.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';

/**
 * What looking an organisation up gave. `found` is a row to add to the list. `problem` is a
 * message to show beside the field. `authorize` and `signed-out` mean the list itself has to
 * start over.
 */
export type OrganizationLookupOutcome =
  | { kind: 'found'; entry: ConnectableAccount }
  | { kind: 'problem'; message: string }
  | { kind: 'authorize'; authorizeUrl: string }
  | { kind: 'signed-out' };

export const organizationRequestFlowPropsSchema = z.object({
  accounts: z.custom<GithubAccountReads>(),
  returnTo: returnToSchema,
});

export type OrganizationRequestFlowProps = z.input<
  typeof organizationRequestFlowPropsSchema
>;

/**
 * Finds an organisation the person names, so they can ask its owners to install the app.
 * GitHub can't tell Dash every organisation someone belongs to, so the person types one or
 * picks a suggestion from their public memberships.
 */
export class OrganizationRequestFlow {
  private readonly accounts: GithubAccountReads;
  private readonly returnTo: string;

  constructor(props: OrganizationRequestFlowProps) {
    const valid = organizationRequestFlowPropsSchema.parse(props);
    this.accounts = valid.accounts;
    this.returnTo = valid.returnTo;
  }

  /** `listed` is what the list already shows, so a login already there isn't looked up again. */
  async lookUp(props: {
    login: string;
    listed: readonly ConnectableAccount[];
  }): Promise<OrganizationLookupOutcome> {
    const login = organizationLoginSchema.safeParse(props.login);
    if (!login.success) {
      return {
        kind: 'problem',
        message: login.error.issues[0]?.message ?? 'Check the login.',
      };
    }
    const shown = OrganizationRequestFlow.find(props.listed, login.data);
    if (shown !== undefined) {
      return {
        kind: 'problem',
        message: `${shown.account.login} is already in the list.`,
      };
    }
    return this.ask(login.data);
  }

  /**
   * Looks each row up again, so its install link carries signed state that hasn't expired.
   * A row GitHub no longer has is dropped. A row that can't be looked up keeps its old link:
   * if that has expired, the setup callback says the request wasn't recorded.
   */
  async refresh(
    lookedUp: readonly ConnectableAccount[],
  ): Promise<ConnectableAccount[]> {
    const refreshed = await Promise.all(
      lookedUp.map(async (entry) => this.again(entry)),
    );
    return refreshed.filter((entry) => entry !== null);
  }

  private async ask(login: string): Promise<OrganizationLookupOutcome> {
    try {
      const answer = await this.accounts.lookUp({
        login,
        returnTo: this.returnTo,
      });
      if (answer.status === 'authorize') {
        return { kind: 'authorize', authorizeUrl: answer.authorizeUrl };
      }
      return answer.status === 'found'
        ? { kind: 'found', entry: answer.entry }
        : {
            kind: 'problem',
            message: `GitHub has no organisation called ${login}.`,
          };
    } catch (cause) {
      if (cause instanceof MissionControlError && cause.status === 401) {
        return { kind: 'signed-out' };
      }
      return {
        kind: 'problem',
        message: 'Dash couldn’t look that organisation up. Try again.',
      };
    }
  }

  private async again(
    entry: ConnectableAccount,
  ): Promise<ConnectableAccount | null> {
    try {
      const answer = await this.accounts.lookUp({
        login: entry.account.login,
        returnTo: this.returnTo,
      });
      if (answer.status === 'found') return answer.entry;
      return answer.status === 'missing' ? null : entry;
    } catch {
      return entry;
    }
  }

  /**
   * The looked-up rows after a refresh of `before`: refreshed rows, then any looked up while
   * the refresh was running, which are newer.
   */
  static withRefreshed(props: {
    before: readonly ConnectableAccount[];
    refreshed: readonly ConnectableAccount[];
    current: readonly ConnectableAccount[];
  }): ConnectableAccount[] {
    const added = props.current.filter(
      (entry) => !props.before.includes(entry),
    );
    const ids = new Set(added.map(({ account }) => account.externalId));
    return [
      ...props.refreshed.filter(({ account }) => !ids.has(account.externalId)),
      ...added,
    ];
  }

  /** The list with looked-up rows added after it, leaving out any the list now has itself. */
  static withLookedUp(props: {
    accounts: readonly ConnectableAccount[];
    lookedUp: readonly ConnectableAccount[];
  }): ConnectableAccount[] {
    const ids = new Set(
      props.accounts.map(({ account }) => account.externalId),
    );
    return [
      ...props.accounts,
      ...props.lookedUp.filter(({ account }) => !ids.has(account.externalId)),
    ];
  }

  private static find(
    listed: readonly ConnectableAccount[],
    login: string,
  ): ConnectableAccount | undefined {
    const wanted = login.toLowerCase();
    return listed.find(({ account }) => account.login.toLowerCase() === wanted);
  }
}
