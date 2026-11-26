import { createHash } from 'node:crypto';

import {
  type AuthContext,
  type BetterAuthPlugin,
  type DBTransactionAdapter,
  getCurrentAdapter,
} from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { generateRandomString } from 'better-auth/crypto';

import { principalKindSchema } from '#src/auth/contracts/principal.ts';
import {
  type SetupBegin,
  setupBeginSchema,
  type SetupEnrolment,
  type SetupGrant,
  setupGrantSchema,
  type SetupStatus,
} from '#src/auth/contracts/setup.ts';
import {
  PasskeyEnrolmentRejectedError,
  SetupClosedError,
  SetupTokenRejectedError,
} from '#src/auth/errors.ts';
import type {
  PasskeyEnrolmentSource,
  PasskeyEnrolmentUser,
} from '#src/auth/services/passkeys/passkeys.ts';

const enrolmentPrefix = 'setup-enrolment:';
const enrolmentLifetimeMilliseconds = 10 * 60 * 1000;

interface StoredSetupToken {
  id: string;
  tokenHash: string;
}

export interface Setup extends PasskeyEnrolmentSource {
  /** Stores the token hash and serves `GET /setup/status` and `POST /setup/begin`. */
  readonly plugin: BetterAuthPlugin;
  /** Run at boot. While nobody has signed up, replaces any earlier token and returns the new one, to log once. Otherwise clears leftovers and returns `null`. */
  issue(props: { context: AuthContext }): Promise<string | null>;
}

/**
 * Bootstraps the first person. Only the token's hash is stored. Beginning setup trades the token
 * for a short-lived enrolment, which the passkey registration then spends: in one transaction it
 * deletes the token, creates the person and stores the passkey. Every step refuses once anyone
 * has signed up.
 */
export class TokenSetup implements Setup {
  readonly plugin: BetterAuthPlugin;

  constructor() {
    this.plugin = {
      id: 'setup',
      schema: {
        setupToken: {
          fields: {
            tokenHash: { type: 'string', required: true, unique: true },
            createdAt: { type: 'date', required: true },
          },
        },
      },
      endpoints: {
        setupStatus: createAuthEndpoint(
          '/setup/status',
          { method: 'GET' },
          async (context) => context.json(await this.status(context.context)),
        ),
        beginSetup: createAuthEndpoint(
          '/setup/begin',
          { method: 'POST', body: setupBeginSchema },
          async (context) =>
            context.json(
              await this.begin({
                context: context.context,
                input: context.body,
              }),
            ),
        ),
      },
    };
  }

  async issue(props: { context: AuthContext }): Promise<string | null> {
    const { adapter } = props.context;
    const stale = await adapter.findMany<StoredSetupToken>({
      model: 'setupToken',
    });
    for (const row of stale) {
      await adapter.delete({
        model: 'setupToken',
        where: [{ field: 'id', value: row.id }],
      });
    }

    if ((await this.countPeople(adapter)) > 0) {
      return null;
    }

    const token = generateRandomString(40, 'a-z', 'A-Z', '0-9');
    await adapter.create({
      model: 'setupToken',
      data: { tokenHash: this.hash(token), createdAt: new Date() },
    });
    return token;
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
      throw new PasskeyEnrolmentRejectedError({
        reason: 'setup expired or was already used. Start again.',
      });
    }

    const grant = this.parseGrant(found.value);
    await this.assertOpen({
      adapter: props.context.adapter,
      tokenHash: grant.tokenHash,
    });
    return {
      id: crypto.randomUUID(),
      name: grant.email,
      displayName: grant.name,
    };
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
      throw new PasskeyEnrolmentRejectedError({
        reason: 'setup expired or was already used. Start again.',
      });
    }

    const grant = this.parseGrant(consumed.value);
    const adapter = await getCurrentAdapter(props.context.adapter);
    if ((await this.countPeople(adapter)) > 0) {
      throw new SetupClosedError();
    }

    const spent = await adapter.deleteMany({
      model: 'setupToken',
      where: [{ field: 'tokenHash', value: grant.tokenHash }],
    });
    if (spent !== 1) {
      throw new SetupTokenRejectedError();
    }

    const person = await props.context.internalAdapter.createUser(
      { name: grant.name, email: grant.email, emailVerified: false },
      { method: 'setup-token' },
    );
    return person.id;
  }

  private async begin(props: {
    context: AuthContext;
    input: SetupBegin;
  }): Promise<SetupEnrolment> {
    const input = setupBeginSchema.parse(props.input);
    const tokenHash = this.hash(input.token);
    await this.assertOpen({ adapter: props.context.adapter, tokenHash });

    const grant: SetupGrant = {
      tokenHash,
      name: input.name,
      email: input.email,
    };
    const enrolment = `${enrolmentPrefix}${generateRandomString(32)}`;
    await props.context.internalAdapter.createVerificationValue({
      identifier: enrolment,
      value: JSON.stringify(grant),
      expiresAt: new Date(Date.now() + enrolmentLifetimeMilliseconds),
    });
    return { enrolment };
  }

  private async status(context: AuthContext): Promise<SetupStatus> {
    const people = await this.countPeople(context.adapter);
    const tokens = await context.adapter.count({ model: 'setupToken' });
    return { open: people === 0 && tokens > 0 };
  }

  private async assertOpen(props: {
    adapter: DBTransactionAdapter;
    tokenHash: string;
  }): Promise<void> {
    if ((await this.countPeople(props.adapter)) > 0) {
      throw new SetupClosedError();
    }

    const stored = await props.adapter.findOne<StoredSetupToken>({
      model: 'setupToken',
      where: [{ field: 'tokenHash', value: props.tokenHash }],
    });
    if (stored === null) {
      throw new SetupTokenRejectedError();
    }
  }

  private async countPeople(adapter: DBTransactionAdapter): Promise<number> {
    return adapter.count({
      model: 'user',
      where: [{ field: 'kind', value: principalKindSchema.enum.user }],
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('base64url');
  }

  private parseGrant(value: string): SetupGrant {
    return setupGrantSchema.parse(JSON.parse(value));
  }
}
