import { createHmac, randomInt } from 'node:crypto';

import {
  type AuthContext,
  type BetterAuthPlugin,
  type DBTransactionAdapter,
  getCurrentAdapter,
} from 'better-auth';

import {
  type RecoveryCodeSet,
  recoveryCodesPerSet,
  recoveryCodeStateSchema,
  type RecoveryCodeStatus,
} from '#src/auth/contracts/recovery.ts';
import { RecoveryCodeSetNotPendingError } from '#src/auth/errors.ts';

/** Lower case without 0, 1, i, l and o, which read alike. */
const codeAlphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const codeLength = 8;

const { pending, active, used } = recoveryCodeStateSchema.enum;

export interface RecoveryCodes {
  /** Better Auth's `recoveryCode` model. */
  readonly schema: NonNullable<BetterAuthPlugin['schema']>;
  status(props: {
    context: AuthContext;
    userId: string;
  }): Promise<RecoveryCodeStatus>;
  /** Replaces the person's unconfirmed set with a new one and returns its codes, the only time they are readable. The confirmed set keeps working. */
  generate(props: {
    context: AuthContext;
    userId: string;
  }): Promise<RecoveryCodeSet>;
  /** Makes a pending set the person's codes and deletes every other set, so old codes stop working. */
  confirm(props: {
    context: AuthContext;
    userId: string;
    setId: string;
  }): Promise<RecoveryCodeStatus>;
  /** The id of the person's unused, confirmed code matching `code`, or `null`. Does the same work whether or not `userId` exists. */
  find(props: {
    context: AuthContext;
    userId: string;
    code: string;
  }): Promise<string | null>;
  /** Whether the code is confirmed and unused. */
  isUsable(props: {
    adapter: DBTransactionAdapter;
    codeId: string;
  }): Promise<boolean>;
  /** Marks the code used, inside the caller's transaction. `false` when it already was, so only one caller spends it. */
  spend(props: {
    adapter: DBTransactionAdapter;
    codeId: string;
    userId: string;
  }): Promise<boolean>;
}

/**
 * Ten one-time codes per person, formatted `xxxx-xxxx`. Only an HMAC of each is stored, keyed
 * with the auth secret and bound to the person's id, so a copy of the database alone can't be
 * brute-forced. A set starts `pending` and becomes the person's codes once they confirm saving
 * it; until then their previous set keeps working.
 */
export class StoredRecoveryCodes implements RecoveryCodes {
  readonly schema: NonNullable<BetterAuthPlugin['schema']> = {
    recoveryCode: {
      fields: {
        userId: {
          type: 'string',
          required: true,
          references: { model: 'user', field: 'id', onDelete: 'cascade' },
        },
        setId: { type: 'string', required: true },
        codeHash: { type: 'string', required: true },
        state: { type: [...recoveryCodeStateSchema.options], required: true },
        usedAt: { type: 'date', required: false },
        createdAt: { type: 'date', required: true },
      },
    },
  };

  async status(props: {
    context: AuthContext;
    userId: string;
  }): Promise<RecoveryCodeStatus> {
    const adapter = await getCurrentAdapter(props.context.adapter);
    const confirmed = await adapter.count({
      model: 'recoveryCode',
      where: [
        { field: 'userId', value: props.userId },
        { field: 'state', operator: 'in', value: [active, used] },
      ],
    });
    const remaining = await adapter.count({
      model: 'recoveryCode',
      where: [
        { field: 'userId', value: props.userId },
        { field: 'state', value: active },
      ],
    });
    return { confirmed: confirmed > 0, remaining };
  }

  async generate(props: {
    context: AuthContext;
    userId: string;
  }): Promise<RecoveryCodeSet> {
    const setId = crypto.randomUUID();
    const codes = this.newCodes();
    await props.context.adapter.transaction(async (adapter) => {
      await adapter.deleteMany({
        model: 'recoveryCode',
        where: [
          { field: 'userId', value: props.userId },
          { field: 'state', value: pending },
        ],
      });
      for (const code of codes) {
        await adapter.create({
          model: 'recoveryCode',
          data: {
            userId: props.userId,
            setId,
            codeHash: this.hash({
              secret: props.context.secret,
              userId: props.userId,
              code,
            }),
            state: pending,
            usedAt: null,
            createdAt: new Date(),
          },
        });
      }
    });
    return { setId, codes };
  }

  async confirm(props: {
    context: AuthContext;
    userId: string;
    setId: string;
  }): Promise<RecoveryCodeStatus> {
    await props.context.adapter.transaction(async (adapter) => {
      const waiting = await adapter.count({
        model: 'recoveryCode',
        where: [
          { field: 'userId', value: props.userId },
          { field: 'setId', value: props.setId },
          { field: 'state', value: pending },
        ],
      });
      if (waiting !== recoveryCodesPerSet) {
        throw new RecoveryCodeSetNotPendingError();
      }

      await adapter.deleteMany({
        model: 'recoveryCode',
        where: [
          { field: 'userId', value: props.userId },
          { field: 'setId', operator: 'ne', value: props.setId },
        ],
      });
      await adapter.updateMany({
        model: 'recoveryCode',
        where: [
          { field: 'userId', value: props.userId },
          { field: 'setId', value: props.setId },
        ],
        update: { state: active },
      });
    });
    return this.status(props);
  }

  async find(props: {
    context: AuthContext;
    userId: string;
    code: string;
  }): Promise<string | null> {
    const found = await props.context.adapter.findOne<{ id: string }>({
      model: 'recoveryCode',
      where: [
        { field: 'userId', value: props.userId },
        {
          field: 'codeHash',
          value: this.hash({ secret: props.context.secret, ...props }),
        },
        { field: 'state', value: active },
      ],
      select: ['id'],
    });
    return found?.id ?? null;
  }

  async isUsable(props: {
    adapter: DBTransactionAdapter;
    codeId: string;
  }): Promise<boolean> {
    const usable = await props.adapter.count({
      model: 'recoveryCode',
      where: [
        { field: 'id', value: props.codeId },
        { field: 'state', value: active },
      ],
    });
    return usable === 1;
  }

  async spend(props: {
    adapter: DBTransactionAdapter;
    codeId: string;
    userId: string;
  }): Promise<boolean> {
    const spent = await props.adapter.updateMany({
      model: 'recoveryCode',
      where: [
        { field: 'id', value: props.codeId },
        { field: 'userId', value: props.userId },
        { field: 'state', value: active },
      ],
      update: { state: used, usedAt: new Date() },
    });
    return spent === 1;
  }

  private newCodes(): string[] {
    const codes = new Set<string>();
    while (codes.size < recoveryCodesPerSet) {
      const characters = Array.from(
        { length: codeLength },
        () => codeAlphabet[randomInt(codeAlphabet.length)],
      ).join('');
      codes.add(`${characters.slice(0, 4)}-${characters.slice(4)}`);
    }
    return [...codes];
  }

  /** Case, spaces and hyphens don't matter, so a code typed from paper still matches. */
  private hash(props: {
    secret: string;
    userId: string;
    code: string;
  }): string {
    const normalized = props.code.toLowerCase().replaceAll(/[\s-]/gu, '');
    return createHmac('sha256', props.secret)
      .update(`recovery-code:${props.userId}:${normalized}`)
      .digest('base64url');
  }
}
