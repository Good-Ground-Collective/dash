import { MissionControlError } from '#lib/api/mission-control-error.ts';
import type { PasskeyAuth } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import type { PasskeyWording } from '#lib/auth/passkey-wording.ts';
import {
  type RecoveryCodes,
  type RecoveryCodeSet,
  recoveryCodeSetSize,
} from '#lib/auth/recovery-codes.ts';

/**
 * Where a codes screen is. `reauth` waits for a passkey sign-in, since generating needs a fresh
 * one. `saving` shows the set until the person confirms they saved it. The codes live only here,
 * in page state.
 */
export type RecoveryCodeStep =
  | { step: 'generating' }
  | { step: 'reauth'; error: string | null }
  | { step: 'saving'; set: RecoveryCodeSet; error: string | null }
  | { step: 'failed'; error: string }
  | { step: 'confirmed'; remaining: number };

export type SavingStep = Extract<RecoveryCodeStep, { step: 'saving' }>;

/**
 * Generating a set of recovery codes and confirming it was saved, for the setup step and the
 * settings panel alike. A set that isn't confirmed is discarded the next time one is generated.
 */
export class RecoveryCodeFlow {
  private readonly codes: RecoveryCodes;
  private readonly auth: Pick<PasskeyAuth, 'signIn'>;
  private readonly wording: Pick<PasskeyWording, 'explain' | 'isCancellation'>;

  constructor(props: {
    codes: RecoveryCodes;
    auth: Pick<PasskeyAuth, 'signIn'>;
    wording: Pick<PasskeyWording, 'explain' | 'isCancellation'>;
  }) {
    this.codes = props.codes;
    this.auth = props.auth;
    this.wording = props.wording;
  }

  /** A new set to save, or `reauth` when the sign-in is too old to make one. */
  async generate(): Promise<RecoveryCodeStep> {
    try {
      return { step: 'saving', set: await this.codes.generate(), error: null };
    } catch (cause) {
      if (RecoveryCodeFlow.hasCode(cause, 'SESSION_NOT_FRESH')) {
        return { step: 'reauth', error: null };
      }
      return {
        step: 'failed',
        error: 'Mission Control didn’t make your codes. Try again.',
      };
    }
  }

  /** Signs in with a passkey to refresh the session, then generates. A dismissed prompt stays on `reauth` without an error. */
  async reauthenticate(): Promise<RecoveryCodeStep> {
    try {
      await this.auth.signIn({ autofill: false });
    } catch (cause) {
      return {
        step: 'reauth',
        error: this.wording.isCancellation(cause)
          ? null
          : this.wording.explain(cause),
      };
    }
    return this.generate();
  }

  /** Confirms the shown set. When a later set replaced it, such as one made in another tab, shows a new set to save instead. */
  async confirm(current: SavingStep): Promise<RecoveryCodeStep> {
    try {
      const status = await this.codes.confirm({ setId: current.set.setId });
      return { step: 'confirmed', remaining: status.remaining };
    } catch (cause) {
      if (RecoveryCodeFlow.hasCode(cause, 'RECOVERY_CODE_SET_NOT_PENDING')) {
        const next = await this.generate();
        return next.step === 'saving'
          ? {
              ...next,
              error:
                'Newer codes replaced those, maybe in another tab. Save this set instead.',
            }
          : next;
      }
      return {
        ...current,
        error: 'Mission Control didn’t save that. Try again.',
      };
    }
  }

  static start(): RecoveryCodeStep {
    return { step: 'generating' };
  }

  /** The codes as a plain text file, one per line, for Copy and Download. */
  static text(set: RecoveryCodeSet): string {
    return [
      'Dash recovery codes',
      'Each code signs you in once so you can add a new passkey.',
      '',
      ...set.codes,
      '',
    ].join('\n');
  }

  /** How many unused codes are left, such as "8 of 10 codes left". */
  static remainingLabel(count: number): string {
    return `${count} of ${recoveryCodeSetSize} codes left`;
  }

  static isRunningLow(count: number): boolean {
    return count <= 2;
  }

  private static hasCode(cause: unknown, code: string): boolean {
    return (
      (cause instanceof MissionControlError ||
        cause instanceof PasskeyAuthError) &&
      cause.code === code
    );
  }
}
