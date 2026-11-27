import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import { ChecklistRoutes } from '#src/onboarding/exposures/checklist-routes/checklist-routes.ts';
import {
  type ConnectionPresence,
  type SetupChecklist,
  SourcedSetupChecklist,
} from '#src/onboarding/services/setup-checklist/setup-checklist.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';

/** What's left of a person's setup, read from the passkeys and connections they already have. Home shows it until it's all done. */
export class OnboardingModule implements HttpModule {
  readonly plugin: FastifyPluginAsyncZod;
  readonly checklist: SetupChecklist;

  constructor(props: {
    identity: Pick<Identity, 'session' | 'passkeyCount'>;
    connections: ConnectionPresence;
  }) {
    this.checklist = new SourcedSetupChecklist({
      passkeys: props.identity,
      connections: props.connections,
    });
    const routes = new ChecklistRoutes({
      checklist: this.checklist,
      identity: props.identity,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }
}
