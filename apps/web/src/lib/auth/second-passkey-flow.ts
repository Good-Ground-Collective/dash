import type { Passkey } from '#lib/api/mission-control.ts';
import type { PasskeyAuth } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import type { PasskeyWording } from '#lib/auth/passkey-wording.ts';

/**
 * Where the second passkey step is. `offer` waits for the person to add one or skip. `reauth`
 * waits for a passkey sign-in, since adding needs a fresh one. `added` holds the new passkey
 * until the person names it or moves on.
 */
export type SecondPasskeyStep =
  | { step: 'offer'; error: string | null }
  | { step: 'reauth'; error: string | null }
  | { step: 'added'; passkey: Passkey; named: boolean; error: string | null };

export type AddedStep = Extract<SecondPasskeyStep, { step: 'added' }>;

/** Adding a passkey on another device during setup, then naming it. */
export class SecondPasskeyFlow {
  private readonly auth: Pick<
    PasskeyAuth,
    'addPasskey' | 'renamePasskey' | 'signIn'
  >;
  private readonly wording: Pick<PasskeyWording, 'explain' | 'isCancellation'>;

  constructor(props: {
    auth: Pick<PasskeyAuth, 'addPasskey' | 'renamePasskey' | 'signIn'>;
    wording: Pick<PasskeyWording, 'explain' | 'isCancellation'>;
  }) {
    this.auth = props.auth;
    this.wording = props.wording;
  }

  /** Asks the browser for a passkey on another device. A dismissed prompt goes back to `offer` without an error. */
  async add(): Promise<SecondPasskeyStep> {
    try {
      const passkey = await this.auth.addPasskey({ onAnotherDevice: true });
      return { step: 'added', passkey, named: false, error: null };
    } catch (cause) {
      if (SecondPasskeyFlow.isStale(cause)) {
        return { step: 'reauth', error: null };
      }
      return { step: 'offer', error: this.explain(cause) };
    }
  }

  /** Signs in with a passkey to refresh the session, then adds. A dismissed prompt stays on `reauth` without an error. */
  async reauthenticate(): Promise<SecondPasskeyStep> {
    try {
      await this.auth.signIn({ autofill: false });
    } catch (cause) {
      return { step: 'reauth', error: this.explain(cause) };
    }
    return this.add();
  }

  /** Names the passkey just added, as Rename in settings does. */
  async name(added: AddedStep, name: string): Promise<SecondPasskeyStep> {
    const trimmed = name.trim();
    if (trimmed === '') {
      return { ...added, error: 'Enter a name for the passkey.' };
    }
    try {
      await this.auth.renamePasskey({ id: added.passkey.id, name: trimmed });
      return {
        ...added,
        passkey: { ...added.passkey, name: trimmed },
        named: true,
        error: null,
      };
    } catch (cause) {
      return { ...added, error: this.wording.explain(cause) };
    }
  }

  private explain(cause: unknown): string | null {
    return this.wording.isCancellation(cause)
      ? null
      : this.wording.explain(cause);
  }

  static start(): SecondPasskeyStep {
    return { step: 'offer', error: null };
  }

  /** The rows to show: the listed passkeys, with the one just added in place or appended. */
  static rows(props: {
    listed: readonly Passkey[];
    current: SecondPasskeyStep;
  }): Passkey[] {
    if (props.current.step !== 'added') return [...props.listed];
    const added = props.current.passkey;
    const others = props.listed.filter((passkey) => passkey.id !== added.id);
    return [...others, added];
  }

  private static isStale(cause: unknown): boolean {
    return (
      cause instanceof PasskeyAuthError && cause.code === 'SESSION_NOT_FRESH'
    );
  }
}
