import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { AuthHandlerRoutes } from '#src/auth/exposures/auth-handler/auth-handler-routes.ts';
import type { AuthStorage } from '#src/auth/repositories/auth-store/auth-store.ts';
import type { ServicePrincipalRepository } from '#src/auth/repositories/service-principals/service-principal-repository.ts';
import {
  BetterAuthIdentity,
  type Identity,
  type IdentitySettings,
} from '#src/auth/services/identity/identity.ts';
import { KindPrincipalGuard } from '#src/auth/services/principal-guard/principal-guard.ts';
import {
  type ServicePrincipals,
  StoredServicePrincipals,
} from '#src/auth/services/service-principals/service-principals.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

/** Who is calling: Better Auth under `/api/auth`, with people and service principals in one `user` table. */
export class AuthModule implements HttpModule {
  readonly identity: Identity;
  readonly plugin: FastifyPluginAsyncZod;
  readonly servicePrincipals: ServicePrincipals;

  constructor(
    props: {
      storage: AuthStorage;
      servicePrincipalRepository: ServicePrincipalRepository;
    } & IdentitySettings,
  ) {
    this.identity = new BetterAuthIdentity({
      ...props,
      guard: new KindPrincipalGuard(),
    });
    this.servicePrincipals = new StoredServicePrincipals({
      repository: props.servicePrincipalRepository,
    });
    const routes = new AuthHandlerRoutes({
      baseUrl: props.baseUrl,
      identity: this.identity,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }
}
