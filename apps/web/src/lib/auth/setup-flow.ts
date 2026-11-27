import type { PasskeyAuth } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import type { PasskeyWording } from '#lib/auth/passkey-wording.ts';

/** Where `/setup` is. The token lives only here, in page state, never in the URL. */
export type SetupStep =
  | { step: 'token'; error: string | null }
  | { step: 'account'; token: string; error: string | null }
  | { step: 'done' }
  | { step: 'closed' };

/**
 * The two setup steps: check the token, then create the account with a passkey. Either step
 * closes when someone else finished setup after the page loaded, since only signing in is left.
 */
export class SetupFlow {
  private readonly auth: Pick<PasskeyAuth, 'checkSetupToken' | 'setUp'>;
  private readonly wording: Pick<PasskeyWording, 'explain'>;

  constructor(props: {
    auth: Pick<PasskeyAuth, 'checkSetupToken' | 'setUp'>;
    wording: Pick<PasskeyWording, 'explain'>;
  }) {
    this.auth = props.auth;
    this.wording = props.wording;
  }

  /** Moves on to the account step when Mission Control accepts the token. The check doesn't spend it. */
  async checkToken(props: { token: string }): Promise<SetupStep> {
    const token = props.token.trim();
    try {
      await this.auth.checkSetupToken({ token });
      return { step: 'account', token, error: null };
    } catch (cause) {
      if (SetupFlow.hasCode(cause, 'SETUP_CLOSED')) return { step: 'closed' };
      return { step: 'token', error: this.wording.explain(cause) };
    }
  }

  /** Begins setup with the checked token and registers the passkey. A token rejected by then goes back to the token step. */
  async createAccount(props: {
    token: string;
    name: string;
    email: string;
  }): Promise<SetupStep> {
    try {
      await this.auth.setUp({
        token: props.token,
        name: props.name.trim(),
        email: props.email.trim(),
      });
      return { step: 'done' };
    } catch (cause) {
      if (SetupFlow.hasCode(cause, 'SETUP_CLOSED')) return { step: 'closed' };
      const error = this.wording.explain(cause);
      if (SetupFlow.hasCode(cause, 'SETUP_TOKEN_REJECTED')) {
        return { step: 'token', error };
      }
      return { step: 'account', token: props.token, error };
    }
  }

  static start(): SetupStep {
    return { step: 'token', error: null };
  }

  /** True when `cause` is Mission Control's answer with `code`. */
  private static hasCode(cause: unknown, code: string): boolean {
    return cause instanceof PasskeyAuthError && cause.code === code;
  }
}
