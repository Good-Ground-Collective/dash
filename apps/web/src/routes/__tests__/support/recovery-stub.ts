import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const enrolmentPrefix = 'recovery-enrolment:';
const attemptsPerEmail = 5;
const windowSeconds = 15 * 60;

const issueSchema = z.object({ codes: z.array(z.string()).min(1) });
const redeemSchema = z.object({ email: z.string(), code: z.string() });

interface StubEnrolment {
  /** The code it spends, or `null` for a break-glass link. */
  code: string | null;
  expired: boolean;
}

export interface RecoveryReply {
  status: number;
  body: object;
  headers?: Record<string, string>;
}

/**
 * Mission Control's recovery codes and break-glass links, for one person. Like Mission Control,
 * redeeming answers the same refusal for an unknown email and a wrong or used code, counts every
 * attempt toward a per-email limit, and spends the code only when a passkey is registered.
 */
export class RecoveryStub {
  /** The one person's email, or `null` before anyone exists. */
  private readonly email: () => string | null;
  private readonly webOrigin: () => string;
  private codes = new Map<string, 'active' | 'used'>();
  private enrolments = new Map<string, StubEnrolment>();
  private attempts = new Map<string, number>();
  /** The enrolment the last registration options were for, which the next registration spends. */
  private pending: string | null = null;

  constructor(props: { email: () => string | null; webOrigin: () => string }) {
    this.email = props.email;
    this.webOrigin = props.webOrigin;
  }

  reset(): void {
    this.codes = new Map();
    this.enrolments = new Map();
    this.attempts = new Map();
    this.pending = null;
  }

  /** Recovery's own paths, or `null` for any other. */
  route(props: { path: string; body: string }): RecoveryReply | null {
    switch (props.path) {
      case '/recovery/redeem':
        return this.redeem(props.body);
      case '/__stub/recovery-codes':
        return this.issue(props.body);
      case '/__stub/break-glass':
        return this.breakGlass();
      case '/__stub/expire-enrolments':
        return this.expireEnrolments();
      default:
        return null;
    }
  }

  /** For registration options without a session: `none` when `context` isn't a recovery enrolment. */
  prepare(context: string | null): 'none' | 'rejected' | 'ready' {
    this.pending = null;
    if (context?.startsWith(enrolmentPrefix) !== true) return 'none';
    if (!this.isUsable(context)) return 'rejected';
    this.pending = context;
    return 'ready';
  }

  /** For a registration without a session: spends the prepared enrolment and its code, if there is one. */
  complete(): 'none' | 'rejected' | 'spent' {
    const context = this.pending;
    this.pending = null;
    if (context === null) return 'none';
    if (!this.isUsable(context)) return 'rejected';
    const code = this.enrolments.get(context)?.code ?? null;
    this.enrolments.delete(context);
    if (code !== null) this.codes.set(code, 'used');
    return 'spent';
  }

  /** Makes `codes` the person's confirmed codes, voiding the earlier ones. */
  activate(codes: string[]): void {
    this.codes = new Map(
      codes.map((code) => [RecoveryStub.normalise(code), 'active'] as const),
    );
  }

  remaining(): number {
    return [...this.codes.values()].filter((state) => state === 'active')
      .length;
  }

  /** `POST /__stub/recovery-codes {codes}`: the person's confirmed codes. */
  private issue(body: string): RecoveryReply {
    const { codes } = issueSchema.parse(JSON.parse(body || '{}'));
    this.activate(codes);
    return { status: 200, body: { remaining: codes.length } };
  }

  /** `POST /__stub/break-glass`: what `dash admin recover` prints. */
  private breakGlass(): RecoveryReply {
    const enrolment = this.enrol(null);
    const url = new URL('/recover/passkey', this.webOrigin());
    url.hash = new URLSearchParams({ enrolment }).toString();
    return { status: 200, body: { url: url.toString() } };
  }

  /** `POST /__stub/expire-enrolments`: as if every enrolment's lifetime ran out. */
  private expireEnrolments(): RecoveryReply {
    for (const enrolment of this.enrolments.values()) enrolment.expired = true;
    return { status: 200, body: { status: true } };
  }

  private redeem(body: string): RecoveryReply {
    const input = redeemSchema.parse(JSON.parse(body || '{}'));
    const email = input.email.trim().toLowerCase();
    const attempts = (this.attempts.get(email) ?? 0) + 1;
    this.attempts.set(email, attempts);
    if (attempts > attemptsPerEmail) {
      return {
        status: 429,
        body: { code: 'RECOVERY_RATE_LIMITED', message: 'Too many attempts.' },
        headers: { 'retry-after': String(windowSeconds) },
      };
    }

    const code = RecoveryStub.normalise(input.code);
    if (email !== this.email()?.toLowerCase() || !this.usable(code)) {
      return {
        status: 401,
        body: { code: 'RECOVERY_REJECTED', message: 'RECOVERY_REJECTED' },
      };
    }
    return { status: 200, body: { enrolment: this.enrol(code) } };
  }

  /** True while the enrolment hasn't expired and its code, if any, is unused. */
  private isUsable(context: string): boolean {
    const enrolment = this.enrolments.get(context);
    if (enrolment === undefined || enrolment.expired) return false;
    return enrolment.code === null || this.usable(enrolment.code);
  }

  private enrol(code: string | null): string {
    const enrolment = `${enrolmentPrefix}${randomBytes(12).toString('hex')}`;
    this.enrolments.set(enrolment, { code, expired: false });
    return enrolment;
  }

  private usable(code: string): boolean {
    return this.codes.get(code) === 'active';
  }

  private static normalise(code: string): string {
    return code.toLowerCase().replace(/[\s-]/gu, '');
  }
}
