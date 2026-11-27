import type { PasskeyAuth, PreparedEnrolment } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import type { PasskeyWording } from '#lib/auth/passkey-wording.ts';

/** How the person got an enrolment: a recovery code on `/recover`, or a break-glass link on `/recover/passkey`. */
export type RecoverySource = 'code' | 'link';

/** Why the code step refused, and what the page marks. */
export interface RecoveryProblem {
  message: string;
  /** True when Mission Control refused the email and code, so the page marks both fields invalid. */
  rejected: boolean;
  /** When another attempt can go through, in epoch milliseconds, after too many tries. `null` when there's no wait. */
  retryAt: number | null;
}

/** Where `/recover` and `/recover/passkey` are. The enrolment lives only in page state. */
export type RecoveryStep =
  | { step: 'code'; problem: RecoveryProblem | null }
  | { step: 'opening' }
  | {
      step: 'passkey';
      source: RecoverySource;
      enrolment: string;
      prepared: PreparedEnrolment;
      error: string | null;
    }
  | { step: 'link-expired' }
  | { step: 'link-missing' }
  | { step: 'link-unavailable'; enrolment: string; error: string }
  | { step: 'done' };

export type PasskeyStep = Extract<RecoveryStep, { step: 'passkey' }>;

type RecoveryAuth = Pick<
  PasskeyAuth,
  'redeemRecoveryCode' | 'prepareEnrolment' | 'enrol'
>;

/**
 * Getting back in without a passkey: trade a recovery code (or open a break-glass link) for an
 * enrolment, show whose account it is, then register a new passkey, which signs in. A code is
 * only spent when its passkey is registered, so an enrolment that expires sends the person back
 * to enter the same code again; an expired link can't be reused.
 */
export class RecoveryFlow {
  private readonly auth: RecoveryAuth;
  private readonly wording: Pick<
    PasskeyWording,
    'explain' | 'isCancellation' | 'retryLater'
  >;

  constructor(props: {
    auth: RecoveryAuth;
    wording: Pick<PasskeyWording, 'explain' | 'isCancellation' | 'retryLater'>;
  }) {
    this.auth = props.auth;
    this.wording = props.wording;
  }

  /** Redeems the code and fetches registration options, so the next step can name the account. */
  async redeem(props: { email: string; code: string }): Promise<RecoveryStep> {
    let enrolment: string;
    try {
      enrolment = await this.auth.redeemRecoveryCode({
        email: props.email.trim(),
        code: props.code.trim(),
      });
    } catch (cause) {
      return { step: 'code', problem: this.redeemProblem(cause) };
    }
    return this.prepare({ source: 'code', enrolment, error: null });
  }

  /** Reads the enrolment from a break-glass link's fragment, such as `#enrolment=recovery-enrolment%3A…`. */
  async openLink(props: { hash: string }): Promise<RecoveryStep> {
    const enrolment = new URLSearchParams(props.hash.replace(/^#/u, '')).get(
      'enrolment',
    );
    if (enrolment === null || enrolment.trim() === '') {
      return { step: 'link-missing' };
    }
    return this.prepare({ source: 'link', enrolment, error: null });
  }

  /** Tries a link's enrolment again after Mission Control couldn't be reached. The fragment is gone by then, so the enrolment comes from page state. */
  async retryLink(props: { enrolment: string }): Promise<RecoveryStep> {
    return this.prepare({
      source: 'link',
      enrolment: props.enrolment,
      error: null,
    });
  }

  /**
   * Runs the passkey ceremony and signs in. On failure it fetches fresh options, since the old
   * challenge may be spent or stale, and stays on the passkey step with the error.
   */
  async register(current: PasskeyStep): Promise<RecoveryStep> {
    try {
      await this.auth.enrol({ prepared: current.prepared });
      return { step: 'done' };
    } catch (cause) {
      if (RecoveryFlow.enrolmentRejected(cause)) {
        return this.expired(current.source);
      }
      const error = this.wording.isCancellation(cause)
        ? null
        : this.wording.explain(cause);
      return this.prepare({
        source: current.source,
        enrolment: current.enrolment,
        error,
      });
    }
  }

  private async prepare(props: {
    source: RecoverySource;
    enrolment: string;
    error: string | null;
  }): Promise<RecoveryStep> {
    try {
      const prepared = await this.auth.prepareEnrolment({
        enrolment: props.enrolment,
      });
      return { step: 'passkey', ...props, prepared };
    } catch (cause) {
      if (RecoveryFlow.enrolmentRejected(cause)) {
        return this.expired(props.source);
      }
      const error = this.wording.explain(cause);
      if (props.source === 'link') {
        return { step: 'link-unavailable', enrolment: props.enrolment, error };
      }
      return {
        step: 'code',
        problem: { message: error, rejected: false, retryAt: null },
      };
    }
  }

  private expired(source: RecoverySource): RecoveryStep {
    if (source === 'link') return { step: 'link-expired' };
    return {
      step: 'code',
      problem: {
        message:
          'That took too long, so your code wasn’t used. Enter it again to continue.',
        rejected: false,
        retryAt: null,
      },
    };
  }

  private redeemProblem(cause: unknown): RecoveryProblem {
    if (
      cause instanceof PasskeyAuthError &&
      cause.code === 'RECOVERY_RATE_LIMITED'
    ) {
      const seconds = cause.retryAfterSeconds;
      return {
        message: this.wording.retryLater(seconds),
        rejected: false,
        retryAt: seconds === undefined ? null : Date.now() + seconds * 1000,
      };
    }
    return {
      message: this.wording.explain(cause),
      rejected:
        cause instanceof PasskeyAuthError && cause.code === 'RECOVERY_REJECTED',
      retryAt: null,
    };
  }

  /** Milliseconds until the code step can try again. Zero when it can now. */
  static waitMs(current: RecoveryStep, now: number): number {
    if (current.step !== 'code' || current.problem?.retryAt == null) return 0;
    return Math.max(0, current.problem.retryAt - now);
  }

  static start(): RecoveryStep {
    return { step: 'code', problem: null };
  }

  static opening(): RecoveryStep {
    return { step: 'opening' };
  }

  private static enrolmentRejected(cause: unknown): boolean {
    return (
      cause instanceof PasskeyAuthError &&
      cause.code === 'PASSKEY_ENROLMENT_REJECTED'
    );
  }
}
