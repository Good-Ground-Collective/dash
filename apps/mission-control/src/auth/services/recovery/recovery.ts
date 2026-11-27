import {
  type AuthContext,
  type BetterAuthPlugin,
  type DBTransactionAdapter,
  getCurrentAdapter,
} from 'better-auth';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { generateRandomString } from 'better-auth/crypto';
import { z } from 'zod';

import { principalKindSchema } from '#src/auth/contracts/principal.ts';
import {
  recoveryCodeConfirmSchema,
  type RecoveryEnrolment,
  type RecoveryGrant,
  recoveryGrantSchema,
  type RecoveryLink,
  type RecoveryRedeem,
  recoveryRedeemSchema,
} from '#src/auth/contracts/recovery.ts';
import {
  PasskeyEnrolmentRejectedError,
  RecoveryPersonNotFoundError,
  RecoveryRejectedError,
  ServicePrincipalForbiddenError,
} from '#src/auth/errors.ts';
import type { FreshSession } from '#src/auth/services/fresh-session/fresh-session.ts';
import type {
  PasskeyEnrolmentSource,
  PasskeyEnrolmentUser,
} from '#src/auth/services/passkeys/passkeys.ts';
import {
  type RecoveryCodes,
  StoredRecoveryCodes,
} from '#src/auth/services/recovery-codes/recovery-codes.ts';
import {
  defaultRecoveryThrottleSettings,
  type RecoveryThrottle,
  WindowRecoveryThrottle,
} from '#src/auth/services/recovery-throttle/recovery-throttle.ts';

const enrolmentPrefix = 'recovery-enrolment:';
const codeEnrolmentLifetimeMilliseconds = 10 * 60 * 1000;
const linkLifetimeMilliseconds = 15 * 60 * 1000;
/** Checked against when the email matches nobody, so a miss does the same work as a wrong code. */
const nobodyId = '00000000-0000-4000-8000-000000000000';

interface StoredPerson {
  id: string;
  email: string;
  name: string;
  kind: string;
}

const personSessionSchema = z.object({
  user: z.object({ id: z.uuid(), kind: principalKindSchema }),
  session: z.object({ createdAt: z.coerce.date() }),
});

export interface Recovery extends PasskeyEnrolmentSource {
  /** Stores the codes and serves `/recovery-codes/{status,generate,confirm}` and `POST /recovery/redeem`. */
  readonly plugin: BetterAuthPlugin;
  readonly codes: RecoveryCodes;
  /** Checks an email and code without spending the code, and returns an enrolment for registering a new passkey. Registering spends the code. */
  redeem(props: {
    context: AuthContext;
    input: RecoveryRedeem;
  }): Promise<RecoveryEnrolment>;
  /** The break-glass path: a single-use link that registers a new passkey, valid for 15 minutes. */
  issueLink(props: {
    context: AuthContext;
    email: string;
  }): Promise<RecoveryLink>;
}

/**
 * Ways back in after losing every passkey, both ending in a new one. A recovery code, or a link
 * from the break-glass command, becomes an enrolment that passkey registration spends: in the
 * registration transaction it marks the code used and signs the person in. Redeeming answers
 * the same way for an unknown email as for a wrong or used code, and is throttled per email and
 * overall.
 */
export class CodeRecovery implements Recovery {
  readonly plugin: BetterAuthPlugin;
  readonly codes: RecoveryCodes = new StoredRecoveryCodes();
  private readonly webOrigin: string;
  private readonly freshSession: FreshSession;
  private readonly throttle: RecoveryThrottle;

  constructor(props: {
    /** Where the break-glass link points: its `/recover/passkey` page. */
    webOrigin: string;
    freshSession: FreshSession;
    throttle?: RecoveryThrottle | undefined;
  }) {
    this.webOrigin = props.webOrigin;
    this.freshSession = props.freshSession;
    this.throttle =
      props.throttle ??
      new WindowRecoveryThrottle(defaultRecoveryThrottleSettings);
    this.plugin = {
      id: 'recovery',
      schema: this.codes.schema,
      endpoints: this.endpoints(),
    };
  }

  async redeem(props: {
    context: AuthContext;
    input: RecoveryRedeem;
  }): Promise<RecoveryEnrolment> {
    const input = recoveryRedeemSchema.parse(props.input);
    this.throttle.attempt({ email: input.email });

    const person = await this.findPerson({
      adapter: props.context.adapter,
      email: input.email,
    });
    const codeId = await this.codes.find({
      context: props.context,
      userId: person?.id ?? nobodyId,
      code: input.code,
    });
    if (person === null || codeId === null) {
      throw new RecoveryRejectedError();
    }

    const { enrolment } = await this.enrol({
      context: props.context,
      grant: { method: 'code', userId: person.id, codeId },
      lifetimeMilliseconds: codeEnrolmentLifetimeMilliseconds,
    });
    return { enrolment };
  }

  async issueLink(props: {
    context: AuthContext;
    email: string;
  }): Promise<RecoveryLink> {
    const email = props.email.trim().toLowerCase();
    const person = await this.findPerson({
      adapter: props.context.adapter,
      email,
    });
    if (person === null) {
      throw new RecoveryPersonNotFoundError({ email });
    }

    const { enrolment, expiresAt } = await this.enrol({
      context: props.context,
      grant: { method: 'link', userId: person.id },
      lifetimeMilliseconds: linkLifetimeMilliseconds,
    });
    const url = new URL('/recover/passkey', this.webOrigin);
    url.hash = new URLSearchParams({ enrolment }).toString();
    return { url: url.toString(), expiresAt };
  }

  async resolve(props: {
    context: AuthContext;
    enrolment: string;
  }): Promise<PasskeyEnrolmentUser | null> {
    if (!props.enrolment.startsWith(enrolmentPrefix)) {
      return null;
    }

    const found = await props.context.internalAdapter.findVerificationValue(
      props.enrolment,
    );
    if (found === null || new Date(found.expiresAt).getTime() <= Date.now()) {
      throw this.spent();
    }

    const grant = this.parseGrant(found.value);
    const adapter = props.context.adapter;
    const person = await adapter.findOne<StoredPerson>({
      model: 'user',
      where: [{ field: 'id', value: grant.userId }],
    });
    if (person?.kind !== principalKindSchema.enum.user) {
      throw this.spent();
    }
    if (
      grant.method === 'code' &&
      !(await this.codes.isUsable({ adapter, codeId: grant.codeId }))
    ) {
      throw this.spent();
    }

    return { id: person.id, name: person.email, displayName: person.name };
  }

  async complete(props: {
    context: AuthContext;
    enrolment: string;
  }): Promise<string | null> {
    if (!props.enrolment.startsWith(enrolmentPrefix)) {
      return null;
    }

    const consumed =
      await props.context.internalAdapter.consumeVerificationValue(
        props.enrolment,
      );
    if (consumed === null) {
      throw this.spent();
    }

    const grant = this.parseGrant(consumed.value);
    if (
      grant.method === 'code' &&
      !(await this.codes.spend({
        adapter: await getCurrentAdapter(props.context.adapter),
        codeId: grant.codeId,
        userId: grant.userId,
      }))
    ) {
      throw this.spent();
    }
    return grant.userId;
  }

  private endpoints(): NonNullable<BetterAuthPlugin['endpoints']> {
    const use = [sessionMiddleware];
    return {
      recoveryCodeStatus: createAuthEndpoint(
        '/recovery-codes/status',
        { method: 'GET', use },
        async (context) =>
          context.json(
            await this.codes.status({
              context: context.context,
              userId: this.person({ session: context.context.session }),
            }),
          ),
      ),
      generateRecoveryCodes: createAuthEndpoint(
        '/recovery-codes/generate',
        { method: 'POST', use },
        async (context) =>
          context.json(
            await this.codes.generate({
              context: context.context,
              userId: this.person({
                session: context.context.session,
                fresh: true,
              }),
            }),
          ),
      ),
      confirmRecoveryCodes: createAuthEndpoint(
        '/recovery-codes/confirm',
        { method: 'POST', body: recoveryCodeConfirmSchema, use },
        async (context) =>
          context.json(
            await this.codes.confirm({
              context: context.context,
              userId: this.person({ session: context.context.session }),
              setId: context.body.setId,
            }),
          ),
      ),
      redeemRecoveryCode: createAuthEndpoint(
        '/recovery/redeem',
        { method: 'POST', body: recoveryRedeemSchema },
        async (context) =>
          context.json(
            await this.redeem({
              context: context.context,
              input: context.body,
            }),
          ),
      ),
    };
  }

  /** The signed-in person's id. Generating needs a fresh sign-in, like other credential changes; confirming needs the set id that only generating hands out. */
  private person(props: {
    session: AuthContext['session'];
    fresh?: boolean;
  }): string {
    const person = personSessionSchema.parse(props.session);
    if (person.user.kind !== principalKindSchema.enum.user) {
      throw new ServicePrincipalForbiddenError({
        action: 'hold recovery codes',
      });
    }
    if (props.fresh === true) {
      this.freshSession.assert(person.session);
    }
    return person.user.id;
  }

  private async findPerson(props: {
    adapter: DBTransactionAdapter;
    email: string;
  }): Promise<StoredPerson | null> {
    const person = await props.adapter.findOne<StoredPerson>({
      model: 'user',
      where: [{ field: 'email', value: props.email }],
    });
    return person?.kind === principalKindSchema.enum.user ? person : null;
  }

  private async enrol(props: {
    context: AuthContext;
    grant: RecoveryGrant;
    lifetimeMilliseconds: number;
  }): Promise<{ enrolment: string; expiresAt: Date }> {
    const enrolment = `${enrolmentPrefix}${generateRandomString(32)}`;
    const expiresAt = new Date(Date.now() + props.lifetimeMilliseconds);
    await props.context.internalAdapter.createVerificationValue({
      identifier: enrolment,
      value: JSON.stringify(props.grant),
      expiresAt,
    });
    return { enrolment, expiresAt };
  }

  private parseGrant(value: string): RecoveryGrant {
    return recoveryGrantSchema.parse(JSON.parse(value));
  }

  private spent(): PasskeyEnrolmentRejectedError {
    return new PasskeyEnrolmentRejectedError({
      reason: 'this recovery expired or was already used. Start again.',
    });
  }
}
