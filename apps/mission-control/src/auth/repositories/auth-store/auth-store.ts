import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import {
  accountTable,
  passkeyTable,
  sessionTable,
  setupTokenTable,
  userTable,
  verificationTable,
} from '#src/auth/repositories/auth-store/auth-store-table.ts';
import type { Database } from '#src/platform/services/database/database.ts';

/** The storage Better Auth reads and writes through: Drizzle in Postgres, or Better Auth's memory adapter in tests. */
export type AuthStorage = NonNullable<BetterAuthOptions['database']>;

/** Where Better Auth keeps its models: users, sessions, accounts, verification values, passkeys and the setup token. */
export interface AuthStore {
  readonly storage: AuthStorage;
}

/** Better Auth's core models, stored in Mission Control's Postgres through Drizzle. */
export class DrizzleAuthStore implements AuthStore {
  readonly storage: AuthStorage;

  constructor(props: { database: Database }) {
    this.storage = drizzleAdapter(props.database.orm, {
      provider: 'pg',
      schema: {
        user: userTable,
        session: sessionTable,
        account: accountTable,
        verification: verificationTable,
        passkey: passkeyTable,
        setupToken: setupTokenTable,
      },
    });
  }
}
