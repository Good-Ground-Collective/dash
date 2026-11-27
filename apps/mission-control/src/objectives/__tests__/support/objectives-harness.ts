import {
  type Capabilities,
  type Capability,
  CapabilitySet,
  InMemoryIntegrationRegistry,
  type Integration,
  taskTrackerCapability,
} from '@dash/integrations-core';

import type { PrincipalSession } from '#src/auth/services/identity/identity.ts';
import {
  FakeTaskTracker,
  fixedNow,
  ObjectivesFixtures,
  ownedId,
} from '#src/objectives/__tests__/support/objectives-fixtures.ts';
import {
  InMemoryObjectiveOverlays,
  InMemoryObjectiveRecords,
} from '#src/objectives/__tests__/support/in-memory-objectives.ts';
import { ObjectivesModule } from '#src/objectives/module.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { HttpServer } from '#src/platform/exposures/http/http-server.ts';

/** Offers the fake task tracker as the `github` provider. */
class FakeIntegration implements Integration {
  readonly id = 'github';
  readonly provider = 'github';
  private readonly capabilities: Capabilities;

  constructor(props: { tracker: FakeTaskTracker }) {
    this.capabilities = CapabilitySet.empty().with(
      taskTrackerCapability,
      props.tracker,
    );
  }

  capability<T extends object>(capability: Capability<T>): T | undefined {
    return this.capabilities.get(capability);
  }
}

/**
 * The objectives module over in-memory rows and overlays and a fake provider tracker, with
 * Ada's owned acme connection added. A `session=<user id>` cookie signs that person in.
 */
export class ObjectivesHarness {
  readonly tracker = new FakeTaskTracker();
  readonly records = new InMemoryObjectiveRecords().add(
    ObjectivesFixtures.target(),
  );
  readonly overlays = new InMemoryObjectiveOverlays();
  readonly module: ObjectivesModule;
  private app: ZodFastifyInstance | undefined;

  constructor() {
    this.module = new ObjectivesModule({
      registry: new InMemoryIntegrationRegistry({
        integrations: [new FakeIntegration({ tracker: this.tracker })],
      }),
      identity: {
        session: async ({ headers }): Promise<PrincipalSession | null> => {
          const userId = /session=(?<id>[\w-]+)/u.exec(
            headers.get('cookie') ?? '',
          )?.groups?.['id'];
          return userId === undefined
            ? null
            : { principalId: userId, kind: 'user', expiresAt: fixedNow };
        },
      },
      reader: this.records,
      writer: this.records,
      overlays: this.overlays,
    });
  }

  async sync(): Promise<this> {
    await this.module.reconcile.syncConnection({ connectionId: ownedId });
    return this;
  }

  async start(): Promise<ZodFastifyInstance> {
    this.app ??= await new HttpServer({
      config: { corsOrigins: [], environment: 'test', logLevel: 'silent' },
      modules: [this.module],
    }).build();
    return this.app;
  }

  async stop(): Promise<void> {
    await this.app?.close();
    this.app = undefined;
  }

  static cookie(userId: string) {
    return { cookie: `session=${userId}` };
  }
}
