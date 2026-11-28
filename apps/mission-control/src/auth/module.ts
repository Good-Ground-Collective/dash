import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import {
  type AgentAuthentication,
  ApiKeyAuthentication,
} from '#src/auth/exposures/api-key-authentication/api-key-authentication.ts';
import { AppearanceEndpoints } from '#src/auth/exposures/appearance-endpoints/appearance-endpoints.ts';
import { AuthHandlerRoutes } from '#src/auth/exposures/auth-handler/auth-handler-routes.ts';
import { ServiceAccountEndpoints } from '#src/auth/exposures/service-account-endpoints/service-account-endpoints.ts';
import { TimeZoneRoutes } from '#src/auth/exposures/time-zone-routes/time-zone-routes.ts';
import type { AuthStore } from '#src/auth/repositories/auth-store/auth-store.ts';
import type { ServicePrincipalRepository } from '#src/auth/repositories/service-principals/service-principal-repository.ts';
import {
  type ApiKeyPrefix,
  PluginApiKeys,
} from '#src/auth/services/api-keys/api-keys.ts';
import {
  freshSessionSeconds,
  MaxAgeFreshSession,
} from '#src/auth/services/fresh-session/fresh-session.ts';
import {
  BetterAuthIdentity,
  type Identity,
  type IdentitySettings,
} from '#src/auth/services/identity/identity.ts';
import { BetterAuthPersonTimeZones } from '#src/auth/services/person-time-zones/person-time-zones.ts';
import {
  OwnedServiceAccounts,
  type ServiceAccounts,
} from '#src/auth/services/service-accounts/service-accounts.ts';
import {
  type ServicePrincipals,
  StoredServicePrincipals,
} from '#src/auth/services/service-principals/service-principals.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

/** Who is calling: Better Auth under `/api/auth`, with people and service principals in one `user` table. People sign in with passkeys and save their appearance and time zone; service accounts send API keys, which other modules check through `agentAuthentication`. */
export class AuthModule implements HttpModule {
  readonly identity: Identity;
  readonly plugin: FastifyPluginAsyncZod;
  readonly servicePrincipals: ServicePrincipals;
  readonly serviceAccounts: ServiceAccounts;
  readonly agentAuthentication: AgentAuthentication;

  constructor(
    props: {
      store: AuthStore;
      servicePrincipalRepository: ServicePrincipalRepository;
      apiKeyPrefix: ApiKeyPrefix;
    } & IdentitySettings,
  ) {
    this.servicePrincipals = new StoredServicePrincipals({
      repository: props.servicePrincipalRepository,
    });
    const apiKeys = new PluginApiKeys({ prefix: props.apiKeyPrefix });
    this.serviceAccounts = new OwnedServiceAccounts({
      servicePrincipals: this.servicePrincipals,
      apiKeys,
    });
    const endpoints = new ServiceAccountEndpoints({
      serviceAccounts: this.serviceAccounts,
      freshSession: new MaxAgeFreshSession({
        maxAgeSeconds: freshSessionSeconds,
      }),
    });

    this.identity = new BetterAuthIdentity({
      ...props,
      storage: props.store.storage,
      plugins: [
        ...apiKeys.plugins,
        endpoints.plugin,
        new AppearanceEndpoints().plugin,
        BetterAuthPersonTimeZones.PLUGIN,
      ],
    });
    this.agentAuthentication = new ApiKeyAuthentication({
      identity: this.identity,
      serviceAccounts: this.serviceAccounts,
    });

    const routes = new AuthHandlerRoutes({ identity: this.identity });
    const timeZoneRoutes = new TimeZoneRoutes({
      timeZones: new BetterAuthPersonTimeZones({ identity: this.identity }),
      identity: this.identity,
    });
    this.plugin = async (app) => {
      await app.register(async (scope) => {
        routes.register(scope);
      });
      await app.register(async (scope) => {
        timeZoneRoutes.register(scope);
      });
      app.addHook('onReady', async () => {
        const token = await this.identity.issueSetupToken();
        if (token !== null) {
          app.log.warn(
            { setupToken: token },
            'Nobody has signed up yet. Open /setup in Dash and enter this one-time setup token. It is replaced at every boot until someone signs up.',
          );
        }
      });
    };
  }
}
