import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';

const confirmSchema = z.object({ setId: z.string() });
const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';

export interface RecoveryCodesReply {
  status: number;
  body: object;
}

/**
 * Mission Control's `/recovery-codes/{status,generate,confirm}` for one person. A person made
 * through setup starts without confirmed codes; one signed straight in starts with a confirmed
 * set, so suites behind sign-in aren't sent to the codes step. Confirmed codes go to `activate`,
 * which makes them the codes `/recovery/redeem` accepts.
 */
export class RecoveryCodesStub {
  private readonly activate: (codes: string[]) => void;
  private readonly remaining: () => number;
  private readonly stale: () => boolean;
  private confirmed = true;
  private pending: { setId: string; codes: string[] } | null = null;

  constructor(props: {
    activate: (codes: string[]) => void;
    remaining: () => number;
    /** True while the session is too old to generate codes. */
    stale: () => boolean;
  }) {
    this.activate = props.activate;
    this.remaining = props.remaining;
    this.stale = props.stale;
  }

  reset(): void {
    this.confirmed = true;
    this.pending = null;
  }

  /** For a person just made through setup, who hasn't saved any codes yet. */
  markUnconfirmed(): void {
    this.confirmed = false;
  }

  /** For a person signed straight in: ten confirmed codes nobody has seen. */
  seed(): void {
    this.confirmed = true;
    this.activate(RecoveryCodesStub.set());
  }

  /** Recovery code paths for a signed-in person, or `null` for any other. Generating needs a fresh sign-in. */
  route(props: { path: string; body: string }): RecoveryCodesReply | null {
    switch (props.path) {
      case '/recovery-codes/status':
        return this.status();
      case '/recovery-codes/generate':
        return this.stale()
          ? RecoveryCodesStub.fail(403, 'SESSION_NOT_FRESH')
          : this.generate();
      case '/recovery-codes/confirm':
        return this.confirm(props.body);
      default:
        return null;
    }
  }

  private status(): RecoveryCodesReply {
    return {
      status: 200,
      body: { confirmed: this.confirmed, remaining: this.remaining() },
    };
  }

  private generate(): RecoveryCodesReply {
    this.pending = { setId: randomUUID(), codes: RecoveryCodesStub.set() };
    return { status: 200, body: this.pending };
  }

  private confirm(body: string): RecoveryCodesReply {
    const { setId } = confirmSchema.parse(JSON.parse(body || '{}'));
    if (this.pending?.setId !== setId) {
      return RecoveryCodesStub.fail(409, 'RECOVERY_CODE_SET_NOT_PENDING');
    }
    this.activate(this.pending.codes);
    this.pending = null;
    this.confirmed = true;
    return this.status();
  }

  private static set(): string[] {
    return Array.from({ length: 10 }, () => {
      const characters = Array.from(
        { length: 8 },
        () => alphabet[randomInt(alphabet.length)],
      ).join('');
      return `${characters.slice(0, 4)}-${characters.slice(4)}`;
    });
  }

  private static fail(status: number, code: string): RecoveryCodesReply {
    return { status, body: { code, message: code } };
  }
}
