import { InMemoryServicePrincipalRepository } from '#src/auth/__tests__/support/in-memory-service-principals.ts';

/** Service principals that can't be removed, as when the database is gone. */
export class UnremovableServicePrincipals extends InMemoryServicePrincipalRepository {
  override async remove(): Promise<boolean> {
    return Promise.reject(new Error('database unavailable'));
  }
}
