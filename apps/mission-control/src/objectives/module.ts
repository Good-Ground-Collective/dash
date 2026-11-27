import {
  type IntegrationRegistry,
  taskTrackerCapability,
} from '@dash/integrations-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { Identity } from '#src/auth/services/identity/identity.ts';
import type { ConnectListener } from '#src/connections/contracts/connect-listener.ts';
import { ObjectivesRoutes } from '#src/objectives/exposures/objectives-routes/objectives-routes.ts';
import type { ObjectiveOverlayRepository } from '#src/objectives/repositories/objective-overlays/objective-overlay-repository.ts';
import type { ObjectiveRecordReader } from '#src/objectives/repositories/objective-records/objective-record-reader.ts';
import type { ObjectiveRecordWriter } from '#src/objectives/repositories/objective-records/objective-record-writer.ts';
import { TrackedObjectiveOverlays } from '#src/objectives/services/objective-overlays/objective-overlays.ts';
import {
  type ObjectiveReconcile,
  TrackedObjectiveReconcile,
} from '#src/objectives/services/objective-reconcile/objective-reconcile.ts';
import { ObjectiveReconcileWorkflows } from '#src/objectives/services/objective-reconcile-workflows/objective-reconcile-workflows.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

/**
 * Objectives: initiatives, epics and tickets read from each owned connection's tracker
 * through `taskTrackerCapability`, a reconcile that keeps them fresh, Dash's overlay beside
 * them, and `GET /objectives` with `PATCH /objectives/:id/overlay`.
 */
export class ObjectivesModule
  implements HttpModule, WorkflowModule, ConnectListener
{
  readonly plugin: FastifyPluginAsyncZod;
  readonly reconcile: ObjectiveReconcile;
  private readonly workflows: ObjectiveReconcileWorkflows;

  constructor(props: {
    registry: IntegrationRegistry;
    identity: Pick<Identity, 'session'>;
    reader: ObjectiveRecordReader;
    writer: ObjectiveRecordWriter;
    overlays: ObjectiveOverlayRepository;
  }) {
    this.reconcile = new TrackedObjectiveReconcile({
      trackers: props.registry
        .offering(taskTrackerCapability)
        .map(({ integration, implementation }) => ({
          provider: integration.provider,
          tracker: implementation,
        })),
      reader: props.reader,
      writer: props.writer,
    });
    this.workflows = new ObjectiveReconcileWorkflows({
      reconcile: this.reconcile,
    });
    const routes = new ObjectivesRoutes({
      reader: props.reader,
      overlayRepository: props.overlays,
      overlays: new TrackedObjectiveOverlays({
        reader: props.reader,
        overlays: props.overlays,
      }),
      identity: props.identity,
    });
    this.plugin = async (app) => {
      routes.register(app);
    };
  }

  async connected(props: { provider: string; userId: string }): Promise<void> {
    await this.workflows.syncPerson({ userId: props.userId });
  }

  async activate(): Promise<void> {
    await this.workflows.activate();
  }

  registerWorkflows(): void {
    this.workflows.registerWorkflows();
  }
}
