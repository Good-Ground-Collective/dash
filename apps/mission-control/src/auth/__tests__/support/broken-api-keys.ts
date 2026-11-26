import type { BetterAuthPlugin } from 'better-auth';

import type {
  ApiKeySummary,
  IssuedApiKey,
} from '#src/auth/contracts/service-account.ts';
import { ApiKeyNotIssuedError } from '#src/auth/errors.ts';
import type {
  ApiKeys,
  VerifiedApiKey,
} from '#src/auth/services/api-keys/api-keys.ts';

/** Keys that can't be issued, as when the store refuses the insert. Everything else finds nothing. */
export class BrokenApiKeys implements ApiKeys {
  readonly plugins: readonly BetterAuthPlugin[] = [];

  async issue(): Promise<IssuedApiKey> {
    return Promise.reject(new ApiKeyNotIssuedError());
  }

  async verify(): Promise<VerifiedApiKey | null> {
    return null;
  }

  async listFor(): Promise<Map<string, ApiKeySummary[]>> {
    return new Map();
  }

  async ownerOf(): Promise<string | null> {
    return null;
  }

  async revoke(): Promise<boolean> {
    return false;
  }

  async revokeAllFor(): Promise<void> {}
}
